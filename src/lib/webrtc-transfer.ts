// Peer-to-peer file transfer using WebRTC + Supabase Realtime for signaling.
// Adds: end-to-end AES-GCM encryption (key lives in URL fragment, never sent to
// the signaling server), STUN + free TURN fallback, multi-receiver fan-out,
// and ICE-restart based connection recovery.
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    // Free public TURN relay for NAT-restrictive networks.
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 4,
};

const CHUNK_SIZE = 16 * 1024;
const BUFFER_HIGH = 4 * 1024 * 1024;
const BUFFER_LOW = 256 * 1024;

export interface TransferMeta {
  name: string;
  size: number;
  type: string;
}

// ---------- Crypto helpers (AES-GCM 256, key exchanged out-of-band via URL fragment) ----------

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const b = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function generateSessionKey(): Promise<{ key: CryptoKey; raw: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key) as ArrayBuffer);
  return { key, raw: b64urlEncode(raw) };
}

export async function importSessionKey(raw: string): Promise<CryptoKey> {
  const bytes = b64urlDecode(raw);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey("raw", buf, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptChunk(key: CryptoKey, plaintext: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const out = new Uint8Array(iv.byteLength + ct.byteLength);
  out.set(iv, 0);
  out.set(ct, iv.byteLength);
  return out.buffer;
}

async function decryptChunk(key: CryptoKey, envelope: ArrayBuffer): Promise<ArrayBuffer> {
  const v = new Uint8Array(envelope);
  const iv = v.slice(0, 12);
  const ct = v.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
}

export interface SenderCallbacks {
  onReceiverJoin?: () => void;
  onReceiversChange?: (count: number) => void;
  onProgress?: (bytes: number, total: number, speed: number) => void;
  onComplete?: () => void;
  onError?: (err: string) => void;
  onStatus?: (s: string) => void;
}

export interface ReceiverCallbacks {
  onMeta?: (meta: TransferMeta) => void;
  onProgress?: (bytes: number, total: number, speed: number) => void;
  onComplete?: (blob: Blob, meta: TransferMeta) => void;
  onError?: (err: string) => void;
  onStatus?: (s: string) => void;
  // Optional streaming sink: when provided, decrypted chunks are written to
  // this stream instead of being buffered into a Blob. Used for very large
  // files to avoid running out of memory. The receiver still calls
  // onComplete with an empty Blob after closing the writer.
  writer?: WritableStreamDefaultWriter<Uint8Array>;
}

function channelName(code: string) {
  return `gf:${code}`;
}

// One PeerConnection + one send worker per receiver.
interface PeerSlot {
  id: string;
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  done: boolean;
  bytes: number;
  cancelled: boolean;
  restartAttempts: number;
}

export class Sender {
  private ch?: RealtimeChannel;
  private file: File;
  private meta: TransferMeta;
  private paused = false;
  private cancelled = false;
  private cb: SenderCallbacks;
  private code: string;
  private key: CryptoKey;
  private peers = new Map<string, PeerSlot>();

  constructor(code: string, file: File, key: CryptoKey, cb: SenderCallbacks) {
    this.code = code;
    this.file = file;
    this.key = key;
    this.meta = { name: file.name, size: file.size, type: file.type || "application/octet-stream" };
    this.cb = cb;
  }

  async start() {
    this.cb.onStatus?.("Waiting for receiver…");
    this.ch = supabase.channel(channelName(this.code), { config: { broadcast: { ack: false } } });

    this.ch.on("broadcast", { event: "join" }, async ({ payload }) => {
      const id = String(payload?.id ?? "");
      if (!id || this.peers.has(id)) return;
      this.cb.onReceiverJoin?.();
      this.cb.onStatus?.("Receiver connected — negotiating…");
      await this.spinUpPeer(id);
    });
    this.ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
      const slot = this.peers.get(payload.to);
      if (slot) { try { await slot.pc.setRemoteDescription(payload.sdp); } catch {} }
    });
    this.ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      const slot = this.peers.get(payload.to);
      if (slot && payload.candidate) { try { await slot.pc.addIceCandidate(payload.candidate); } catch {} }
    });
    this.ch.on("broadcast", { event: "bye" }, ({ payload }) => this.dropPeer(payload?.id));

    await new Promise<void>((resolve) => this.ch!.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    }));
  }

  private emitReceiverCount() {
    this.cb.onReceiversChange?.(this.peers.size);
  }

  private dropPeer(id?: string) {
    if (!id) return;
    const slot = this.peers.get(id);
    if (!slot) return;
    slot.cancelled = true;
    try { slot.dc?.close(); } catch {}
    try { slot.pc.close(); } catch {}
    this.peers.delete(id);
    this.emitReceiverCount();
  }

  private async spinUpPeer(id: string) {
    const pc = new RTCPeerConnection(ICE);
    const slot: PeerSlot = { id, pc, done: false, bytes: 0, cancelled: false, restartAttempts: 0 };
    this.peers.set(id, slot);
    this.emitReceiverCount();

    pc.onicecandidate = (e) => {
      if (e.candidate) this.ch?.send({ type: "broadcast", event: "ice", payload: { to: id, from: "sender", candidate: e.candidate } });
    };
    pc.oniceconnectionstatechange = async () => {
      if (pc.iceConnectionState === "failed" && slot.restartAttempts < 2) {
        slot.restartAttempts++;
        this.cb.onStatus?.("Connection lost — retrying…");
        try {
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          this.ch?.send({ type: "broadcast", event: "offer", payload: { to: id, sdp: offer } });
        } catch { this.cb.onError?.("Reconnection failed"); }
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.dropPeer(id);
      }
    };

    const dc = pc.createDataChannel("file", { ordered: true });
    slot.dc = dc;
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = BUFFER_LOW;
    dc.onopen = async () => {
      dc.send(JSON.stringify({ kind: "meta", meta: this.meta }));
      this.runSendLoop(slot).catch((e) => this.cb.onError?.(e?.message || "Transfer error"));
    };
    dc.onerror = () => this.cb.onError?.("Data channel error");

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.ch?.send({ type: "broadcast", event: "offer", payload: { to: id, sdp: offer } });
  }

  private async runSendLoop(slot: PeerSlot) {
    this.cb.onStatus?.("Transferring…");
    const dc = slot.dc!;
    let offset = 0;
    const start = performance.now();
    let lastReport = start;
    let lastBytes = 0;
    while (offset < this.file.size) {
      if (this.cancelled || slot.cancelled) return;
      if (this.paused) { await new Promise((r) => setTimeout(r, 200)); continue; }
      if (dc.readyState !== "open") { await new Promise((r) => setTimeout(r, 150)); continue; }
      if (dc.bufferedAmount > BUFFER_HIGH) {
        await new Promise<void>((r) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; r(); }; });
        continue;
      }
      const slice = this.file.slice(offset, offset + CHUNK_SIZE);
      const plain = await slice.arrayBuffer();
      const enc = await encryptChunk(this.key, plain);
      dc.send(enc);
      offset += plain.byteLength;
      slot.bytes = offset;
      const now = performance.now();
      if (now - lastReport > 200) {
        const speed = ((offset - lastBytes) * 1000) / (now - lastReport);
        // Report the slowest receiver so users see honest progress.
        const min = Math.min(...Array.from(this.peers.values()).map((p) => p.bytes));
        this.cb.onProgress?.(min, this.file.size, speed);
        lastReport = now; lastBytes = offset;
      }
    }
    dc.send(JSON.stringify({ kind: "done" }));
    slot.done = true;
    const allDone = Array.from(this.peers.values()).every((p) => p.done);
    if (allDone) {
      this.cb.onProgress?.(this.file.size, this.file.size, 0);
      this.cb.onComplete?.();
      this.cb.onStatus?.("Transfer complete");
    }
  }

  pause() { this.paused = true; this.cb.onStatus?.("Paused"); }
  resume() { this.paused = false; this.cb.onStatus?.("Transferring…"); }
  cancel() {
    this.cancelled = true;
    this.peers.forEach((slot) => { try { slot.dc?.close(); slot.pc.close(); } catch {} });
    this.peers.clear();
    if (this.ch) supabase.removeChannel(this.ch);
    this.cb.onStatus?.("Cancelled");
  }
}

export class Receiver {
  private pc?: RTCPeerConnection;
  private ch?: RealtimeChannel;
  private code: string;
  private id: string;
  private key: CryptoKey;
  private cb: ReceiverCallbacks;
  private chunks: ArrayBuffer[] = [];
  private meta?: TransferMeta;
  private received = 0;
  private lastReport = 0;
  private lastBytes = 0;

  constructor(code: string, key: CryptoKey, cb: ReceiverCallbacks) {
    this.code = code;
    this.key = key;
    this.cb = cb;
    this.id = crypto.randomUUID();
  }

  async start() {
    this.cb.onStatus?.("Connecting to sender…");
    this.ch = supabase.channel(channelName(this.code), { config: { broadcast: { ack: false } } });
    this.pc = new RTCPeerConnection(ICE);
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.ch?.send({ type: "broadcast", event: "ice", payload: { to: this.id, from: this.id, candidate: e.candidate } });
    };
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc?.iceConnectionState === "failed") this.cb.onStatus?.("Connection lost — waiting for retry…");
    };
    this.pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.binaryType = "arraybuffer";
      dc.onmessage = (ev) => { this.handleMessage(ev.data).catch((err) => this.cb.onError?.(err?.message || "Decrypt error")); };
      dc.onerror = () => this.cb.onError?.("Data channel error");
    };
    this.ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (payload.to !== this.id) return;
      try {
        await this.pc!.setRemoteDescription(payload.sdp);
        const ans = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(ans);
        this.ch!.send({ type: "broadcast", event: "answer", payload: { to: this.id, sdp: ans } });
      } catch (err) { this.cb.onError?.((err as Error)?.message || "Negotiation failed"); }
    });
    this.ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (payload.to !== this.id || !payload.candidate) return;
      try { await this.pc?.addIceCandidate(payload.candidate); } catch {}
    });
    await new Promise<void>((resolve) => this.ch!.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    }));
    this.ch.send({ type: "broadcast", event: "join", payload: { id: this.id } });
  }

  private async handleMessage(data: ArrayBuffer | string) {
    if (typeof data === "string") {
      const msg = JSON.parse(data);
      if (msg.kind === "meta") {
        this.meta = msg.meta;
        this.lastReport = performance.now();
        this.cb.onMeta?.(msg.meta);
        this.cb.onStatus?.("Receiving…");
      } else if (msg.kind === "done") {
        this.cb.onProgress?.(this.received, this.meta?.size || this.received, 0);
        if (this.cb.writer) {
          try { await this.cb.writer.close(); } catch {}
          this.cb.onComplete?.(new Blob([], { type: this.meta?.type }), this.meta!);
        } else {
          const blob = new Blob(this.chunks, { type: this.meta?.type });
          this.chunks = [];
          this.cb.onComplete?.(blob, this.meta!);
        }
        this.cb.onStatus?.("Transfer complete");
      }
      return;
    }
    const plain = await decryptChunk(this.key, data);
    if (this.cb.writer) {
      try {
        await this.cb.writer.write(new Uint8Array(plain));
      } catch (err) {
        this.cb.onError?.((err as Error)?.message || "Write error");
        return;
      }
    } else {
      this.chunks.push(plain);
    }
    this.received += plain.byteLength;
    const now = performance.now();
    if (now - this.lastReport > 200) {
      const speed = ((this.received - this.lastBytes) * 1000) / (now - this.lastReport);
      this.cb.onProgress?.(this.received, this.meta?.size || this.received, speed);
      this.lastReport = now; this.lastBytes = this.received;
    }
  }

  cancel() {
    try { this.ch?.send({ type: "broadcast", event: "bye", payload: { id: this.id } }); } catch {}
    try { this.pc?.close(); } catch {}
    if (this.ch) supabase.removeChannel(this.ch);
    this.cb.onStatus?.("Cancelled");
  }
}