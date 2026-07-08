import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Activity, Bell, Copy, FileText, Link2, RefreshCw, RotateCcw, Trash2, TrendingUp, Zap, User as UserIcon } from "lucide-react";
import { formatBytes } from "@/lib/format";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — GrantFile" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

interface Profile { id: string; display_name: string | null; email: string | null; total_transfers: number; total_bytes_transferred: number; theme_preference: string; }
interface ShareRow { id: string; short_code: string; file_name: string; file_size: number; download_count: number; created_at: string; is_active: boolean; deleted_at: string | null; }
interface TransferRow { id: string; file_name: string; file_size: number; status: string; bytes_transferred: number; created_at: string; }
interface NotificationRow { id: string; title: string; message: string | null; type: string; is_read: boolean; created_at: string; }
interface ActivityRow { id: string; action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string; }

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [links, setLinks] = useState<ShareRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/auth" }); return; }
      if (cancelled) return;
      setUser(data.user);
      const [p, l, t, n, a] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
        supabase.from("shared_links").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }),
        supabase.from("transfers").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("notifications").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("activity_logs").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (cancelled) return;
      setProfile(p.data as Profile | null);
      setDisplayName((p.data as Profile | null)?.display_name ?? "");
      setLinks((l.data as ShareRow[] | null) ?? []);
      setTransfers((t.data as TransferRow[] | null) ?? []);
      setNotifications((n.data as NotificationRow[] | null) ?? []);
      setActivities((a.data as ActivityRow[] | null) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  // Realtime notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`user-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setNotifications((prev) => [payload.new as NotificationRow, ...prev]);
          toast.info((payload.new as NotificationRow).title);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const trashLink = async (id: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("shared_links").update({ deleted_at: now, is_active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, deleted_at: now, is_active: false } : l)));
    if (user) await supabase.from("activity_logs").insert({ user_id: user.id, action: "link.trashed", entity_type: "shared_link", entity_id: id });
    toast.success("Moved to Trash");
  };
  const restoreLink = async (id: string) => {
    const { error } = await supabase.from("shared_links").update({ deleted_at: null, is_active: true }).eq("id", id);
    if (error) return toast.error(error.message);
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, deleted_at: null, is_active: true } : l)));
    if (user) await supabase.from("activity_logs").insert({ user_id: user.id, action: "link.restored", entity_type: "shared_link", entity_id: id });
    toast.success("Link restored");
  };
  const purgeLink = async (id: string) => {
    const { error } = await supabase.from("shared_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    if (user) await supabase.from("activity_logs").insert({ user_id: user.id, action: "link.deleted", entity_type: "shared_link", entity_id: id });
    toast.success("Deleted permanently");
  };
  const emptyTrash = async () => {
    if (!user) return;
    const { error } = await supabase.from("shared_links").delete().eq("user_id", user.id).not("deleted_at", "is", null);
    if (error) return toast.error(error.message);
    setLinks((prev) => prev.filter((l) => !l.deleted_at));
    await supabase.from("activity_logs").insert({ user_id: user.id, action: "trash.emptied", entity_type: "shared_link" });
    toast.success("Trash emptied");
  };
  const toggleLink = async (row: ShareRow) => {
    const next = !row.is_active;
    const { error } = await supabase.from("shared_links").update({ is_active: next }).eq("id", row.id);
    if (error) return toast.error(error.message);
    setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, is_active: next } : l)));
  };
  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };
  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/receive/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    const [p, l, t, n, a] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("shared_links").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("transfers").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("activity_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setProfile(p.data as Profile | null);
    setLinks((l.data as ShareRow[] | null) ?? []);
    setTransfers((t.data as TransferRow[] | null) ?? []);
    setNotifications((n.data as NotificationRow[] | null) ?? []);
    setActivities((a.data as ActivityRow[] | null) ?? []);
    setLoading(false);
    toast.success("Refreshed");
  };

  const activeLinks = links.filter((l) => !l.deleted_at);
  const trashedLinks = links.filter((l) => !!l.deleted_at);

  const stats = {
    total: transfers.length,
    downloads: activeLinks.reduce((a, l) => a + l.download_count, 0),
    storage: transfers.reduce((a, t) => a + Number(t.file_size || 0), 0),
    active: activeLinks.filter((l) => l.is_active).length,
  };

  return (
    <div className="min-h-dvh" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 md:px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back{profile?.display_name ? `, ${profile.display_name}` : ""}.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={() => navigate({ to: "/send" })} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
              <Zap className="h-4 w-4 mr-2" /> New transfer
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Transfers" value={String(stats.total)} loading={loading} />
          <StatCard icon={<FileText className="h-4 w-4" />} label="Total downloads" value={String(stats.downloads)} loading={loading} />
          <StatCard icon={<Activity className="h-4 w-4" />} label="Data shared" value={formatBytes(stats.storage)} loading={loading} />
          <StatCard icon={<Link2 className="h-4 w-4" />} label="Active links" value={String(stats.active)} loading={loading} />
        </div>

        <Tabs defaultValue="links" className="mt-8">
          <TabsList className="glass">
            <TabsTrigger value="links">Shared links</TabsTrigger>
            <TabsTrigger value="transfers">Transfers</TabsTrigger>
            <TabsTrigger value="activity"><Activity className="h-3.5 w-3.5 mr-1" /> Activity</TabsTrigger>
            <TabsTrigger value="trash"><Trash2 className="h-3.5 w-3.5 mr-1" /> Trash{trashedLinks.length ? ` (${trashedLinks.length})` : ""}</TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-3.5 w-3.5 mr-1" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="profile"><UserIcon className="h-3.5 w-3.5 mr-1" /> Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="links" className="mt-4">
            <Card className="glass p-4">
              {loading ? <Skeleton className="h-24" /> : activeLinks.length === 0 ? <Empty msg="No shared links yet." /> : (
                <ul className="divide-y divide-border/50">
                  {activeLinks.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.file_name}</div>
                        <div className="text-xs text-muted-foreground">{formatBytes(l.file_size)} · {l.download_count} downloads · code <span className="font-mono">{l.short_code}</span></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${l.is_active ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}`}>{l.is_active ? "Active" : "Disabled"}</span>
                        <Button variant="outline" size="sm" onClick={() => copyLink(l.short_code)}>
                          <Copy className="h-4 w-4 mr-1" /> Copy
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleLink(l)}>{l.is_active ? "Disable" : "Enable"}</Button>
                        <Confirm title="Move to Trash?" desc="The link will be disabled and moved to Trash. You can restore it later." onConfirm={() => trashLink(l.id)}>
                          <Button variant="outline" size="icon" aria-label="Move link to trash"><Trash2 className="h-4 w-4" /></Button>
                        </Confirm>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card className="glass p-4">
              {loading ? <Skeleton className="h-24" /> : activities.length === 0 ? <Empty msg="No activity yet." /> : (
                <ul className="divide-y divide-border/50">
                  {activities.map((a) => (
                    <li key={a.id} className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono">{a.action}</span>
                        {a.entity_type && <span className="text-xs text-muted-foreground">{a.entity_type}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="trash" className="mt-4">
            <Card className="glass p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-muted-foreground">Deleted links are kept here until you empty the trash.</div>
                {trashedLinks.length > 0 && (
                  <Confirm title="Empty trash?" desc="All trashed links will be permanently deleted." onConfirm={emptyTrash}>
                    <Button variant="outline" size="sm"><Trash2 className="h-4 w-4 mr-1" /> Empty trash</Button>
                  </Confirm>
                )}
              </div>
              {loading ? <Skeleton className="h-24" /> : trashedLinks.length === 0 ? <Empty msg="Trash is empty." /> : (
                <ul className="divide-y divide-border/50">
                  {trashedLinks.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.file_name}</div>
                        <div className="text-xs text-muted-foreground">{formatBytes(l.file_size)} · deleted {l.deleted_at ? new Date(l.deleted_at).toLocaleString() : ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => restoreLink(l.id)}><RotateCcw className="h-4 w-4 mr-1" /> Restore</Button>
                        <Confirm title="Delete permanently?" desc="This cannot be undone." onConfirm={() => purgeLink(l.id)}>
                          <Button variant="outline" size="icon" aria-label="Delete permanently"><Trash2 className="h-4 w-4" /></Button>
                        </Confirm>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="transfers" className="mt-4">
            <Card className="glass p-4">
              {loading ? <Skeleton className="h-24" /> : transfers.length === 0 ? <Empty msg="No transfers recorded yet." /> : (
                <ul className="divide-y divide-border/50">
                  {transfers.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.file_name}</div>
                        <div className="text-xs text-muted-foreground">{formatBytes(t.file_size)} · {new Date(t.created_at).toLocaleString()}</div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">{t.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <Card className="glass p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-muted-foreground">Live updates from your account.</div>
                <Button variant="outline" size="sm" onClick={markAllRead}>Mark all read</Button>
              </div>
              {loading ? <Skeleton className="h-24" /> : notifications.length === 0 ? <Empty msg="No notifications." /> : (
                <ul className="divide-y divide-border/50">
                  {notifications.map((n) => (
                    <li key={n.id} className="py-3">
                      <div className="flex items-center gap-2">
                        {!n.is_read && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Unread" />}
                        <span className="font-medium">{n.title}</span>
                      </div>
                      {n.message && <div className="text-sm text-muted-foreground mt-1">{n.message}</div>}
                      <div className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="mt-4">
            <Card className="glass p-6 max-w-xl">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dn">Display name</Label>
                  <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input id="profile-email" name="email" value={profile?.email ?? user?.email ?? ""} disabled />
                </div>
                <Button onClick={saveProfile} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">Save changes</Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string; loading: boolean }) {
  return (
    <Card className="glass p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="mt-2 text-2xl font-bold gradient-text">{loading ? <Skeleton className="h-7 w-16" /> : value}</div>
    </Card>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{msg}</div>;
}

function Confirm({ title, desc, onConfirm, children }: { title: string; desc: string; onConfirm: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent className="glass-strong">
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{desc}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}