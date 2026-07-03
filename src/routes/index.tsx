import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Upload, Zap, Shield, Globe, Link2, QrCode, ArrowRight, Lock, Cpu, Sparkles, Rocket } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContactModal } from "@/components/contact-modal";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { formatBytes } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);

  const startWithFile = useCallback((file: File) => {
    // Stash file in memory and navigate to /send
    (window as unknown as { __gfFile?: File }).__gfFile = file;
    navigate({ to: "/send" });
  }, [navigate]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) startWithFile(file);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startWithFile(file);
  };

  return (
    <div className="min-h-dvh relative overflow-hidden">
      {/* animated background */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full blur-3xl animate-float-slow" style={{ background: "oklch(0.7 0.28 300 / 40%)" }} />
      <div aria-hidden className="pointer-events-none absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full blur-3xl animate-float-slower" style={{ background: "oklch(0.72 0.22 195 / 30%)" }} />

      <div className="relative">
        <SiteHeader />

        <main>
          {/* Hero */}
          <section className="mx-auto max-w-6xl px-4 md:px-6 pt-16 md:pt-24 pb-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-6">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>End-to-end encrypted · WebRTC · No file size limit</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
              Share files <span className="gradient-text">instantly</span>.
              <br />
              Directly. Securely.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              GrantFile connects browsers directly with WebRTC. Files never touch our servers — they stream peer to peer, encrypted end to end.
            </p>

            {/* Drag & drop */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`mx-auto mt-10 max-w-3xl glass-strong rounded-3xl p-10 md:p-14 border-2 border-dashed transition-all ${dragOver ? "border-primary neon-glow" : "border-border/60"}`}
            >
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl animate-pulse-glow" style={{ background: "var(--gradient-primary)" }}>
                <Upload className="h-7 w-7 text-primary-foreground" />
              </div>
              <p className="text-lg font-semibold">Drop a file to share instantly</p>
              <p className="text-sm text-muted-foreground mt-1">or choose one from your device</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <label className="cursor-pointer">
                  <input type="file" className="sr-only" onChange={onPick} multiple={false} />
                  <span className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg" style={{ background: "var(--gradient-primary)" }}>
                    <Upload className="h-4 w-4" /> Choose file
                  </span>
                </label>
                <Button variant="outline" size="lg" onClick={() => navigate({ to: "/send" })}>
                  <Link2 className="h-4 w-4 mr-2" /> Quick share link
                </Button>
                <Button variant="outline" size="lg" onClick={() => navigate({ to: "/receive" })}>
                  <QrCode className="h-4 w-4 mr-2" /> Receive a file
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-4">
              {[
                { k: "0", v: "Files on servers" },
                { k: "P2P", v: "Direct browser transfer" },
                { k: "AES", v: "End-to-end encrypted" },
              ].map((s) => (
                <div key={s.v} className="glass rounded-2xl p-4">
                  <div className="text-2xl font-bold gradient-text">{s.k}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.v}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Features */}
          <section id="features" className="mx-auto max-w-6xl px-4 md:px-6 py-16">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold">Built for the modern web</h2>
              <p className="text-muted-foreground mt-2">Everything you need to move files fast, with zero compromise on privacy.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { icon: Zap, title: "Instant transfers", body: "WebRTC data channels give you direct, high-throughput browser-to-browser transfers." },
                { icon: Shield, title: "End-to-end encrypted", body: "Every byte is encrypted with DTLS. Not even we can see what you share." },
                { icon: Globe, title: "Works anywhere", body: "Any device, any browser, any network — no downloads, no installs." },
                { icon: QrCode, title: "QR + short links", body: "Share a code, link, or QR — the recipient joins with one tap." },
                { icon: Cpu, title: "Multi-receiver", body: "Broadcast the same file to multiple peers simultaneously." },
                { icon: Lock, title: "You own your data", body: "Files never touch our servers unless you opt in to cloud storage." },
              ].map((f) => (
                <Card key={f.title} className="glass p-6 border-border/40 hover:border-primary/40 transition-colors">
                  <f.icon className="h-6 w-6 text-accent mb-3" />
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
                </Card>
              ))}
            </div>
          </section>

          {/* How */}
          <section id="how" className="mx-auto max-w-6xl px-4 md:px-6 py-16">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold">How it works</h2>
              <p className="text-muted-foreground mt-2">Three steps. That's it.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { n: "01", t: "Drop a file", d: "Pick anything from your device — up to whatever your RAM can hold." },
                { n: "02", t: "Share the link", d: "We generate a private code, link, and QR you can send anywhere." },
                { n: "03", t: "Direct transfer", d: "The recipient's browser connects to yours and streams the file." },
              ].map((s) => (
                <div key={s.n} className="glass rounded-2xl p-6">
                  <div className="text-4xl font-bold gradient-text">{s.n}</div>
                  <h3 className="mt-3 font-semibold">{s.t}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{s.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Security */}
          <section id="security" className="mx-auto max-w-6xl px-4 md:px-6 py-16">
            <div className="glass-strong rounded-3xl p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-medium mb-4">
                  <Shield className="h-3.5 w-3.5 text-accent" /> Security
                </div>
                <h2 className="text-3xl md:text-4xl font-bold">Private by design.</h2>
                <p className="text-muted-foreground mt-3">
                  Every transfer is a direct DTLS-encrypted WebRTC session between two browsers. We only exchange signaling metadata — the file bytes never leave the peer connection.
                </p>
                <ul className="mt-6 space-y-2 text-sm">
                  {["DTLS/SRTP end-to-end encryption", "Ephemeral connection IDs", "No file logging or scanning", "Row-level security on user data", "Open, auditable web standards"].map((b) => (
                    <li key={b} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> {b}</li>
                  ))}
                </ul>
              </div>
              <div className="glass rounded-2xl p-6 font-mono text-xs leading-relaxed text-muted-foreground">
                <div><span className="text-accent">▸</span> peer.connect(id) — DTLS handshake</div>
                <div><span className="text-accent">▸</span> stream chunks: {formatBytes(16 * 1024)} / frame</div>
                <div><span className="text-accent">▸</span> encryption: <span className="text-primary">AES-128-GCM</span></div>
                <div><span className="text-accent">▸</span> signaling: ephemeral broadcast channel</div>
                <div><span className="text-accent">▸</span> storage: <span className="text-primary">none by default</span></div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="mx-auto max-w-3xl px-4 md:px-6 py-16">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold">Frequently asked</h2>
            </div>
            <Accordion type="single" collapsible className="glass rounded-2xl px-2">
              {[
                { q: "Are my files stored on your servers?", a: "No. Transfers happen browser-to-browser over WebRTC. Optional cloud storage is available for signed-in users." },
                { q: "Is there a file size limit?", a: "Not from us. Practical limits depend on your device memory and the recipient staying online during the transfer." },
                { q: "Do I need an account?", a: "No account is needed to send or receive. Sign in to unlock the dashboard, history, and multi-device features." },
                { q: "Which browsers are supported?", a: "Every modern browser that supports WebRTC data channels: Chrome, Firefox, Safari, Edge, and Chromium mobile browsers." },
                { q: "Can I share with multiple people?", a: "Yes — one sender can serve multiple receivers simultaneously with the same share code." },
              ].map((item, i) => (
                <AccordionItem key={i} value={String(i)}>
                  <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          {/* CTA */}
          <section className="mx-auto max-w-4xl px-4 md:px-6 py-16 text-center">
            <div className="glass-strong rounded-3xl p-10">
              <Rocket className="h-8 w-8 mx-auto text-accent mb-3" />
              <h2 className="text-3xl md:text-4xl font-bold">Ready to send?</h2>
              <p className="text-muted-foreground mt-2">Free. Private. No signup required.</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" onClick={() => navigate({ to: "/send" })} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
                  Start sharing <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <ContactModal />
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
