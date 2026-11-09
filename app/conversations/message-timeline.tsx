"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function MessageTimeline({ conversationId, children }: { conversationId: string; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    // Open each conversation on its latest message, without scrolling the entire page.
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    const observer = new MutationObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [conversationId]);
  return <div ref={container} className="message-timeline" onScroll={() => {
    const el = container.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }}>{children}</div>;
}
