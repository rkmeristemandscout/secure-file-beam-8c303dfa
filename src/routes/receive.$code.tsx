import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Lock, ShieldAlert, FileIcon, CheckCircle2, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Receiver, importSessionKey, type TransferMeta } from "@/lib/webrtc-transfer";
import { formatBytes, formatSpeed } from "@/lib/format";
import { toast } from "sonner";
import streamSaver from "streamsaver";

const STREAM_THRESHOLD = 500 * 1024 * 1024; // 500 MB → stream directly to disk

export const Route = createFileRoute("/receive/$code")({
  head: ({ params }) => ({ meta: [{ title: `Receive ${params.code} — GrantFile` }] }),
  component: ReceiveCode,
});

function ReceiveCode() {
  const { code } = Route.useParams();
  const [meta, setMeta] = useState<TransferMeta | null>(null);
  const [bytes, setBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [status, setStatus] = useState("Preparing download…");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("");
  const [keyMissing, setKeyMissing] = useState(false);
  const [phase, setPhase] = useState<"init" | "connecting" | "downloading" | "done" | "error">("init");
  const recvRef = useRef<Receiver | null>(null);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);

  // Auto-start on mount: validate key, connect, and stream/buffer the file.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const m = /[#&]k=([^&]+)/.exec(hash);
      if (!m) { setKeyMissing(true); setPhase("error"); return; }
      let key: CryptoKey;
      try { key = await importSessionKey(m[1]); }
      catch { setKeyMissing(true); setPhase("error"); return; }
      if (cancelled) return;
      setPhase("connecting");
      setStatus("Connecting to sender…");

      let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
      const r = new Receiver(code, key, {
        onStatus: (s) => setStatus(s),
        onMeta: (mm) => {
          setMeta(mm);
          setDownloadName(mm.name);
          setPhase("downloading");
          // For very large files, stream directly to disk to avoid RAM blowup.
          if (mm.size >= STREAM_THRESHOLD && typeof window !== "undefined") {
            try {
              const stream = streamSaver.createWriteStream(mm.name, { size: mm.size });
              writer = stream.getWriter();
              (r as unknown as { cb: { writer?: WritableStreamDefaultWriter<Uint8Array> } }).cb.writer = writer;
              toast.message("Streaming to disk", { description: "Your browser will save the file as it downloads." });
            } catch {
              // Fall back to in-memory buffering.
            }
          }
        },
        onProgress: (b, _t, s) => { setBytes(b); setSpeed(s); },
        onComplete: (blob, mm) => {
          setPhase("done");
          setDownloadName(mm.name);
          if (writer) {
            // StreamSaver already wrote the file to disk.
            toast.success("Download complete");
          } else {
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            // Auto-trigger save so the user doesn't need an extra click.
            setTimeout(() => anchorRef.current?.click(), 50);
            toast.success("Download ready");
          }
        },
        onError: (e) => { setPhase("error"); toast.error(e); },
      });
      recvRef.current = r;
      try { await r.start(); } catch (e) { setPhase("error"); toast.error((e as Error)?.message || "Connection failed"); }
    })();
    return () => {
      cancelled = true;
      recvRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  const pct = meta && meta.size ? Math.round((bytes / meta.size) * 100) : 0;
  const eta = useMemo(() => {
    if (!meta || !speed) return "";
    const s = Math.max(0, Math.round((meta.size - bytes) / speed));
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }, [meta, bytes, speed]);

  return (
    <div className="min-h-dvh" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Card className="glass-strong p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Incoming transfer</h1>
              <p className="text-muted-foreground text-sm mt-1">Code: <span className="font-mono gradient-text font-bold">{code}</span></p>
            </div>
          </div>

          {keyMissing && (
            <div className="mt-6 rounded-xl glass p-4 flex items-start gap-3 text-sm">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
              <div>Encryption key missing from URL. Ask the sender to share the full link (with the <code className="font-mono">#k=…</code> fragment).</div>
            </div>
          )}
          {!keyMissing && (
            <div className="mt-4 text-xs text-muted-foreground inline-flex items-center gap-1">
              <Lock className="h-3 w-3 text-accent" /> End-to-end encrypted (AES-GCM)
            </div>
          )}

          {!keyMissing && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl glass p-4 flex items-start gap-3">
                <FileIcon className="h-8 w-8 text-accent shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted-foreground">File</div>
                  <div className="font-medium truncate">{meta?.name ?? "Waiting for sender…"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {meta ? `${formatBytes(meta.size)} · ${meta.type || "file"}` : "Establishing secure connection…"}
                  </div>
                </div>
              </div>
              {phase === "downloading" && (
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">{status}</span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <Progress value={pct} />
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                    <div>Got: <span className="text-foreground">{formatBytes(bytes)}</span></div>
                    <div>Speed: <span className="text-foreground">{speed ? formatSpeed(speed) : "—"}</span></div>
                    <div>ETA: <span className="text-foreground">{eta || "—"}</span></div>
                  </div>
                </div>
              )}

              {phase === "connecting" && (
                <Button disabled className="w-full h-12 text-base">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Connecting…
                </Button>
              )}
              {phase === "downloading" && (
                <Button disabled className="w-full h-12 text-base">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Downloading {pct}%
                </Button>
              )}
              {phase === "done" && (
                downloadUrl ? (
                  <a
                    ref={anchorRef}
                    href={downloadUrl}
                    download={downloadName}
                    className="flex items-center justify-center w-full text-center rounded-xl px-6 py-3 h-12 font-semibold text-primary-foreground shadow-lg"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Download className="h-4 w-4 mr-2" /> Download {downloadName}
                  </a>
                ) : (
                  <div className="flex items-center justify-center w-full h-12 rounded-xl glass text-sm">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-accent" /> Saved to your device
                  </div>
                )
              )}
              {phase === "error" && !keyMissing && (
                <Button onClick={() => window.location.reload()} className="w-full h-12">
                  Retry
                </Button>
              )}
            </div>
          )}
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}