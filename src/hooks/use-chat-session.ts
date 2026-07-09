import { useEffect, useState } from "react";

const KEY = "gf-chat-session";

export function useChatSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(KEY, id);
      }
      setSessionId(id);
    } catch {
      setSessionId(crypto.randomUUID());
    }
  }, []);
  return sessionId;
}