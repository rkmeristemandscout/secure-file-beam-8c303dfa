import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Zap, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — GrantFile" }, { name: "description", content: "Sign in or create your GrantFile account." }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        toast.success("Account created — check your inbox to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed");
    if (!result.redirected && !result.error) navigate({ to: "/dashboard" });
  };

  const reset = async () => {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <div className="min-h-dvh relative flex items-center justify-center px-4" style={{ background: "var(--gradient-hero)" }}>
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 font-bold">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--gradient-primary)" }}>
          <Zap className="h-5 w-5 text-primary-foreground" />
        </span>
        <span className="gradient-text">GrantFile</span>
      </Link>
      <Card className="glass-strong w-full max-w-md p-8">
        <h1 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "signin" ? "Sign in to access your dashboard." : "Track transfers and manage shared links."}
        </p>

        <Button onClick={google} variant="outline" className="w-full mt-6" aria-label="Continue with Google">
          <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5.04c1.72 0 3.27.59 4.49 1.75l3.35-3.35C17.96 1.53 15.24.5 12 .5 7.31.5 3.26 3.14 1.28 7.02l3.89 3.02C6.16 7.07 8.87 5.04 12 5.04z"/><path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.5-1.13 2.77-2.4 3.62l3.79 2.94c2.22-2.05 3.64-5.06 3.64-8.8z"/><path fill="#FBBC05" d="M5.17 14.06a7.2 7.2 0 010-4.12L1.28 6.92A11.98 11.98 0 000 12c0 1.9.45 3.71 1.28 5.08l3.89-3.02z"/><path fill="#34A853" d="M12 23.5c3.24 0 5.96-1.07 7.94-2.9l-3.79-2.94c-1.05.7-2.4 1.12-4.15 1.12-3.13 0-5.84-2.03-6.83-4.9l-3.89 3.02C3.26 20.86 7.31 23.5 12 23.5z"/></svg>
          Continue with Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-muted-foreground hover:text-foreground">
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          {mode === "signin" && (
            <button type="button" onClick={reset} className="text-muted-foreground hover:text-foreground">Forgot password?</button>
          )}
        </div>
      </Card>
    </div>
  );
}