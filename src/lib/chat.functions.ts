import { createServerFn } from "@tanstack/react-start";
import { generateText, type ModelMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const SYSTEM_PROMPT =
  "You are GrantFile Assistant, a friendly and helpful AI. Answer clearly and concisely using markdown when useful. If the user asks about GrantFile, explain it as a peer-to-peer, end-to-end encrypted file sharing platform where files transfer directly browser-to-browser via a share link or QR code — no size limits and no accounts required.";

const InputSchema = z.object({
  threadId: z.string().uuid(),
  message: z.string().trim().min(1).max(8000),
});

function serverSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const supabase = serverSupabase();

    // Save user message
    const { error: insertUserErr } = await supabase
      .from("chat_messages")
      .insert({ thread_id: data.threadId, role: "user", content: data.message });
    if (insertUserErr) throw new Error(insertUserErr.message);

    // Load full history
    const { data: rows, error: histErr } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (histErr) throw new Error(histErr.message);

    const messages: ModelMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(rows ?? []).map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
      })),
    ];

    const gateway = createLovableAiGatewayProvider(key);
    let assistantText = "";
    try {
      const result = await generateText({
        model: gateway("openai/gpt-5.5"),
        messages,
      });
      assistantText = result.text.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI request failed";
      if (msg.includes("429")) throw new Error("Rate limit reached. Please wait a moment and try again.");
      if (msg.includes("402")) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
      throw new Error(msg);
    }

    if (!assistantText) assistantText = "(no response)";

    await supabase
      .from("chat_messages")
      .insert({ thread_id: data.threadId, role: "assistant", content: assistantText });

    // Touch thread updated_at + set title from first message if still default
    const { data: threadRow } = await supabase
      .from("chat_threads")
      .select("title")
      .eq("id", data.threadId)
      .maybeSingle();
    const patch: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
    if (threadRow?.title === "New chat") {
      patch.title = data.message.slice(0, 60);
    }
    await supabase.from("chat_threads").update(patch).eq("id", data.threadId);

    return { reply: assistantText };
  });