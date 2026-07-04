import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Upload, Copy, Check, X, Pause, Play, Link2, Zap, Lock, Users } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Sender, generateSessionKey } from "@/lib/webrtc-transfer";
import { formatBytes, formatSpeed, shortCode } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/send")({
  head: () => ({ meta: [{ title: "Send a file — GrantFile" }, { name: "description", content: "Share a file peer-to-peer over WebRTC." }] }),
  component: SendPage,
});

function SendPage() {
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState<string>("");
  const [keyRaw, setKeyRaw] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [receivers, setReceivers] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const senderRef = useRef<Sender | null>(null);

  // Pull file dropped from landing page
  useEffect(() => {
    const w = window as unknown as { __gfFile?: File };
    if (w.__gfFile) { setFile(w.__gfFile); w.__gfFile = undefined; }
  }, []);

  const shareUrl = useMemo(
    () => (code && keyRaw ? `${window.location.origin}/receive/${code}#k=${keyRaw}` : ""),
    [code, keyRaw],
  );
  const eta = useMemo(() => {
    if (!file || !speed) return "";
    const remaining = file.size - bytes;
    const secs = Math.max(0, Math.round(remaining / speed));
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }, [file, bytes, speed]);

  const startShare = async () => {
    if (!file) return toast.error("Pick a file first");
    const c = shortCode(6);
    const { key, raw } = await generateSessionKey();
    setCode(c);
    setKeyRaw(raw);
    const s = new Sender(c, file, key, {
      onStatus: setStatus,
      onReceiverJoin: () => setConnected(true),
      onReceiversChange: setReceivers,
      onProgress: (b: number, _t: number, sp: number) => { setBytes(b); setSpeed(sp); },
      onComplete: async () => {
        setDone(true);
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          await supabase.from("transfers")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("user_id", u.user.id).eq("short_code", c);
        }
      },
      onError: (e: string) => toast.error(e),
    });
    senderRef.current = s;
    await s.start();
    // record link for signed-in users (optional)
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from("shared_links").insert({
        user_id: data.user.id,
        short_code: c,
        file_name: file.name,
        file_size: file.size,
      });
      await supabase.from("transfers").insert({
        user_id: data.user.id,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        status: "pending",
        short_code: c,
      });
    }
  };

  const cancel = () => { senderRef.current?.cancel(); setStatus("Cancelled"); setCode(""); };
  const togglePause = () => {
    if (!senderRef.current) return;
    if (paused) senderRef.current.resume(); else senderRef.current.pause();
    setPaused(!paused);
  };
  const copy = async () => { await navigator.clipboard.writeText(shareUrl); setCopied(true); toast.success("Link copied"); setTimeout(() => setCopied(false), 1500); };

  useEffect(() => () => senderRef.current?.cancel(), []);

  const pct = file && file.size ? Math.round((bytes / file.size) * 100) : 0;

  return (
    <div className="min-h-dvh relative" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 md:px-6 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Send a file</h1>
          <p className="text-muted-foreground">Peer-to-peer, encrypted, no size limit.</p>
        </div>

        {!code && (
          <Card className="glass-strong p-8">
            <label className="block cursor-pointer">
              <input type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <div className="rounded-2xl border-2 border-dashed border-border/60 p-12 text-center hover:border-primary/60 transition-colors">
                <Upload className="h-10 w-10 mx-auto text-accent" />
                <div className="mt-3 font-medium">{file ? file.name : "Click to pick a file"}</div>
                <div className="text-sm text-muted-foreground mt-1">{file ? formatBytes(file.size) : "Any file, any size"}</div>
              </div>
            </label>
            <Button onClick={startShare} disabled={!file} className="w-full mt-6 bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <Zap className="h-4 w-4 mr-2" /> Generate share link
            </Button>
          </Card>
        )}

        {code && file && (
          <Card className="glass-strong p-8 space-y-6">
            <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <div className="text-sm text-muted-foreground">Share this link</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 rounded-xl glass px-4 py-3 font-mono text-sm break-all">{shareUrl}</div>
                  <Button size="icon" variant="outline" onClick={copy} aria-label="Copy link">
                    {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="mt-4 text-sm text-muted-foreground flex flex-wrap items-center gap-3">
                  <span>Code: <span className="font-mono text-foreground text-lg font-bold gradient-text">{code}</span></span>
                  <span className="inline-flex items-center gap-1 text-xs"><Lock className="h-3 w-3 text-accent" /> End-to-end encrypted</span>
                  <span className="inline-flex items-center gap-1 text-xs"><Users className="h-3 w-3" /> {receivers} connected</span>
                </div>
              </div>
              <div className="rounded-2xl p-3 bg-white">
                <QRCodeSVG value={shareUrl} size={160} bgColor="#ffffff" fgColor="#000000" level="M" includeMargin={false} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">{status || (connected ? "Transferring…" : "Waiting for receiver…")}</span>
                <span className="font-mono">{pct}%</span>
              </div>
              <Progress value={pct} />
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                <div>Sent: <span className="text-foreground">{formatBytes(bytes)}</span> / {formatBytes(file.size)}</div>
                <div>Speed: <span className="text-foreground">{speed ? formatSpeed(speed) : "—"}</span></div>
                <div>ETA: <span className="text-foreground">{done ? "done" : eta || "—"}</span></div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!done && connected && (
                <Button variant="outline" onClick={togglePause}>
                  {paused ? <><Play className="h-4 w-4 mr-2" /> Resume</> : <><Pause className="h-4 w-4 mr-2" /> Pause</>}
                </Button>
              )}
              {!done && (
                <Button variant="outline" onClick={cancel}>
                  <X className="h-4 w-4 mr-2" /> Cancel
                </Button>
              )}
              <Button variant="outline" onClick={copy}>
                <Link2 className="h-4 w-4 mr-2" /> Copy link
              </Button>
            </div>
            {done && (
              <div className="rounded-xl glass p-4 text-sm">
                🎉 Transfer complete — keep this tab open until all receivers finish.
              </div>
            )}
          </Card>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}