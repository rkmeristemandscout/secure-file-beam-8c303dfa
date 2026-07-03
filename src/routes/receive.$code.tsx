import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Receiver, type TransferMeta } from "@/lib/webrtc-transfer";
import { formatBytes, formatSpeed } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/receive/$code")({
  head: ({ params }) => ({ meta: [{ title: `Receive ${params.code} — GrantFile` }] }),
  component: ReceiveCode,
});

function ReceiveCode() {
  const { code } = Route.useParams();
  const [meta, setMeta] = useState<TransferMeta | null>(null);
  const [bytes, setBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("");
  const [started, setStarted] = useState(false);
  const recvRef = useRef<Receiver | null>(null);

  const start = async () => {
    setStarted(true);
    const r = new Receiver(code, {
      onStatus: setStatus,
      onMeta: setMeta,
      onProgress: (b, _t, s) => { setBytes(b); setSpeed(s); },
      onComplete: (blob, m) => {
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName(m.name);
        toast.success("File received!");
      },
      onError: (e) => toast.error(e),
    });
    recvRef.current = r;
    await r.start();
  };

  const cancel = () => { recvRef.current?.cancel(); };
  useEffect(() => () => { recvRef.current?.cancel(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

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

          {!started && (
            <Button onClick={start} className="w-full mt-8 bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <Download className="h-4 w-4 mr-2" /> Connect to sender
            </Button>
          )}

          {started && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl glass p-4">
                <div className="text-sm text-muted-foreground">File</div>
                <div className="font-medium">{meta?.name ?? "Waiting for metadata…"}</div>
                <div className="text-xs text-muted-foreground mt-1">{meta ? formatBytes(meta.size) : ""}</div>
              </div>
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
              {downloadUrl ? (
                <a href={downloadUrl} download={downloadName} className="block w-full text-center rounded-xl px-6 py-3 font-semibold text-primary-foreground shadow-lg" style={{ background: "var(--gradient-primary)" }}>
                  Download {downloadName}
                </a>
              ) : (
                <Button variant="outline" onClick={cancel}><X className="h-4 w-4 mr-2" /> Cancel</Button>
              )}
            </div>
          )}
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}