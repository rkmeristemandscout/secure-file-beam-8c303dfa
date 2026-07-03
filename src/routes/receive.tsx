import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/receive")({
  head: () => ({ meta: [{ title: "Receive a file — GrantFile" }] }),
  component: ReceiveEntry,
});

function ReceiveEntry() {
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="glass-strong p-8">
          <h1 className="text-2xl font-bold">Receive a file</h1>
          <p className="text-muted-foreground text-sm mt-1">Enter the share code from the sender.</p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (code.trim()) navigate({ to: "/receive/$code", params: { code: code.trim().toUpperCase() } }); }}
            className="mt-6 space-y-3"
          >
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. AB4XZ9" className="text-center font-mono text-2xl tracking-widest h-14" maxLength={12} />
            <Button type="submit" className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <Download className="h-4 w-4 mr-2" /> Connect
            </Button>
          </form>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}