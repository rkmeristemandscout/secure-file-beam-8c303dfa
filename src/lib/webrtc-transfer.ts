// Peer-to-peer file transfer using WebRTC + Supabase Realtime for signaling.
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

const CHUNK_SIZE = 16 * 1024;

export interface TransferMeta {
  name: string;
  size: number;
  type: string;
}

export interface SenderCallbacks {
  onReceiverJoin?: () => void;
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
}

function channelName(code: string) {
  return `gf:${code}`;
}

export class Sender {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private ch?: RealtimeChannel;
  private file: File;
  private meta: TransferMeta;
  private paused = false;
  private cancelled = false;
  private cb: SenderCallbacks;
  private code: string;

  constructor(code: string, file: File, cb: SenderCallbacks) {
    this.code = code;
    this.file = file;
    this.meta = { name: file.name, size: file.size, type: file.type || "application/octet-stream" };
    this.cb = cb;
  }

  async start() {
    this.cb.onStatus?.("Waiting for receiver…");
    this.ch = supabase.channel(channelName(this.code), { config: { broadcast: { ack: false } } });

    this.ch.on("broadcast", { event: "join" }, async () => {
      this.cb.onReceiverJoin?.();
      this.cb.onStatus?.("Receiver connected — negotiating…");
      await this.createOffer();
    });
    this.ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
      await this.pc?.setRemoteDescription(payload.sdp);
    });
    this.ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      try { await this.pc?.addIceCandidate(payload.candidate); } catch {}
    });

    await new Promise<void>((resolve) => this.ch!.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    }));
  }

  private async createOffer() {
    this.pc = new RTCPeerConnection(ICE);
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.ch?.send({ type: "broadcast", event: "ice", payload: { candidate: e.candidate } });
    };
    this.dc = this.pc.createDataChannel("file", { ordered: true });
    this.dc.binaryType = "arraybuffer";
    this.dc.bufferedAmountLowThreshold = 256 * 1024;
    this.dc.onopen = () => {
      this.dc!.send(JSON.stringify({ kind: "meta", meta: this.meta }));
      this.sendFile();
    };
    this.dc.onerror = () => this.cb.onError?.("Data channel error");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.ch?.send({ type: "broadcast", event: "offer", payload: { sdp: offer } });
  }

  private async sendFile() {
    this.cb.onStatus?.("Transferring…");
    let offset = 0;
    const start = performance.now();
    let lastReport = start;
    let lastBytes = 0;
    while (offset < this.file.size) {
      if (this.cancelled) return;
      if (this.paused) { await new Promise((r) => setTimeout(r, 200)); continue; }
      if (this.dc!.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise<void>((r) => {
          this.dc!.onbufferedamountlow = () => { this.dc!.onbufferedamountlow = null; r(); };
        });
        continue;
      }
      const slice = this.file.slice(offset, offset + CHUNK_SIZE);
      const buf = await slice.arrayBuffer();
      this.dc!.send(buf);
      offset += buf.byteLength;
      const now = performance.now();
      if (now - lastReport > 200) {
        const speed = ((offset - lastBytes) * 1000) / (now - lastReport);
        this.cb.onProgress?.(offset, this.file.size, speed);
        lastReport = now; lastBytes = offset;
      }
    }
    this.dc!.send(JSON.stringify({ kind: "done" }));
    this.cb.onProgress?.(this.file.size, this.file.size, 0);
    this.cb.onComplete?.();
    this.cb.onStatus?.("Transfer complete");
  }

  pause() { this.paused = true; this.cb.onStatus?.("Paused"); }
  resume() { this.paused = false; this.cb.onStatus?.("Transferring…"); }
  cancel() {
    this.cancelled = true;
    try { this.dc?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    if (this.ch) supabase.removeChannel(this.ch);
    this.cb.onStatus?.("Cancelled");
  }
}

export class Receiver {
  private pc?: RTCPeerConnection;
  private ch?: RealtimeChannel;
  private code: string;
  private cb: ReceiverCallbacks;
  private chunks: ArrayBuffer[] = [];
  private meta?: TransferMeta;
  private received = 0;
  private startedAt = 0;
  private lastReport = 0;
  private lastBytes = 0;

  constructor(code: string, cb: ReceiverCallbacks) {
    this.code = code;
    this.cb = cb;
  }

  async start() {
    this.cb.onStatus?.("Connecting to sender…");
    this.ch = supabase.channel(channelName(this.code), { config: { broadcast: { ack: false } } });
    this.pc = new RTCPeerConnection(ICE);
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.ch?.send({ type: "broadcast", event: "ice", payload: { candidate: e.candidate } });
    };
    this.pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.binaryType = "arraybuffer";
      dc.onmessage = (ev) => this.handleMessage(ev.data);
      dc.onerror = () => this.cb.onError?.("Data channel error");
    };
    this.ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
      await this.pc!.setRemoteDescription(payload.sdp);
      const ans = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(ans);
      this.ch!.send({ type: "broadcast", event: "answer", payload: { sdp: ans } });
    });
    this.ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      try { await this.pc?.addIceCandidate(payload.candidate); } catch {}
    });
    await new Promise<void>((resolve) => this.ch!.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    }));
    this.ch.send({ type: "broadcast", event: "join", payload: {} });
  }

  private handleMessage(data: ArrayBuffer | string) {
    if (typeof data === "string") {
      const msg = JSON.parse(data);
      if (msg.kind === "meta") {
        this.meta = msg.meta;
        this.startedAt = performance.now();
        this.lastReport = this.startedAt;
        this.cb.onMeta?.(msg.meta);
        this.cb.onStatus?.("Receiving…");
      } else if (msg.kind === "done") {
        const blob = new Blob(this.chunks, { type: this.meta?.type });
        this.cb.onProgress?.(this.received, this.meta?.size || this.received, 0);
        this.cb.onComplete?.(blob, this.meta!);
        this.cb.onStatus?.("Transfer complete");
      }
      return;
    }
    this.chunks.push(data);
    this.received += data.byteLength;
    const now = performance.now();
    if (now - this.lastReport > 200) {
      const speed = ((this.received - this.lastBytes) * 1000) / (now - this.lastReport);
      this.cb.onProgress?.(this.received, this.meta?.size || this.received, speed);
      this.lastReport = now; this.lastBytes = this.received;
    }
  }

  cancel() {
    try { this.pc?.close(); } catch {}
    if (this.ch) supabase.removeChannel(this.ch);
    this.cb.onStatus?.("Cancelled");
  }
}