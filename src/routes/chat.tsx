import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useChatSession } from "@/hooks/use-chat-session";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { Plus, MessageSquare, Trash2, Bot } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  component: ChatLayout,
});

type Thread = { id: string; title: string; updated_at: string };

function ChatLayout() {
  const sessionId = useChatSession();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id, title, updated_at")
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false });
    if (!error && data) setThreads(data);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load, activeId]);

  const newChat = async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({ session_id: sessionId, title: "New chat" })
      .select("id")
      .single();
    setLoading(false);
    if (error || !data) {
      toast.error("Could not create chat");
      return;
    }
    navigate({ to: "/chat/$threadId", params: { threadId: data.id } });
  };

  const del = async (id: string) => {
    await supabase.from("chat_threads").delete().eq("id", id);
    if (activeId === id) navigate({ to: "/chat" });
    load();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <div className="flex-1 mx-auto w-full max-w-7xl grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 px-4 py-4">
        <aside className="glass rounded-2xl p-3 flex flex-col gap-2 md:h-[calc(100vh-6rem)]">
          <Button onClick={newChat} disabled={!sessionId || loading} className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" /> New chat
          </Button>
          <div className="text-xs uppercase tracking-wide text-muted-foreground px-2 pt-2">Conversations</div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {threads.length === 0 && (
              <div className="text-sm text-muted-foreground px-2 py-8 text-center">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No chats yet
              </div>
            )}
            {threads.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                  activeId === t.id ? "bg-primary/15 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
                }`}
              >
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className="flex-1 flex items-center gap-2 truncate"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.title || "New chat"}</span>
                </Link>
                <button
                  onClick={() => del(t.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive"
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>
        <main className="glass rounded-2xl overflow-hidden md:h-[calc(100vh-6rem)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}