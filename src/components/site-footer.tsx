import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/50 mt-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6 py-10 flex flex-col md:flex-row justify-between gap-6">
        <div>
          <Link to="/" className="flex items-center gap-2 font-bold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
              <Zap className="h-4 w-4 text-primary-foreground" aria-hidden />
            </span>
            <span className="gradient-text">GrantFile</span>
          </Link>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Peer-to-peer, browser-native file sharing. Encrypted, direct, and instant.
          </p>
        </div>
        <div className="text-sm text-muted-foreground flex flex-col md:items-end gap-1">
          <span>© {new Date().getFullYear()} GrantFile</span>
          <span>Made for humans who value privacy.</span>
        </div>
      </div>
    </footer>
  );
}