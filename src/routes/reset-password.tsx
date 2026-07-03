import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — GrantFile" }] }),
  component: ResetPw,
});

function ResetPw() {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };
  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: "var(--gradient-hero)" }}>
      <Card className="glass-strong w-full max-w-md p-8">
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
          <Button disabled={loading} className="w-full">Update password</Button>
        </form>
      </Card>
    </div>
  );
}