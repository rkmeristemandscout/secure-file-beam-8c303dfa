import { createFileRoute } from "@tanstack/react-router";
import { Bot, Sparkles } from "lucide-react";

export const Route = createFileRoute("/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-4" style={{ background: "var(--gradient-primary)" }}>
        <Bot className="h-8 w-8 text-primary-foreground" />
      </div>
      <h1 className="text-2xl font-bold gradient-text mb-2">GrantFile Assistant</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        Ask me anything — GrantFile, coding, ideas, or just chat. Click <b>New chat</b> to get started.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg w-full text-sm text-left">
        {[
          "How does GrantFile transfer files?",
          "Write a haiku about sharing files",
          "Explain WebRTC in one paragraph",
          "Give me a productivity tip",
        ].map((s) => (
          <div key={s} className="rounded-lg border border-border/50 px-3 py-2 text-muted-foreground flex gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" /> {s}
          </div>
        ))}
      </div>
    </div>
  );
}