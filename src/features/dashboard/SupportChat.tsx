/** Floating AI support chat: answers from the student's own account data. */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { ChatStatus, UIMessage } from "ai";
import { Ticket } from "lucide-react";

import { AICoreIcon } from "@/components/ai-elements/AICoreIcon";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supportAsk, supportBotLink, supportQuota } from "@/lib/support.functions";
import { useI18n } from "@/lib/i18n";
import { TicketFormDialog } from "./TicketForm";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "إيه المواعيد القريبة عليّا؟",
  "وريني درجاتي المرصودة",
  "المزامنة شغالة صح؟",
  "عندي اقتراح لتحسين الموقع",
];

export function SupportChat() {
  const { dir } = useI18n();
  const ask = useServerFn(supportAsk);
  const botLink = useServerFn(supportBotLink);
  const readQuota = useServerFn(supportQuota);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [quota, setQuota] = useState<{
    chat: { remaining: number; limit: number; resetLabel: string };
    ticket: { remaining: number; limit: number; resetLabel: string };
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!open || botUrl) return;
    void botLink({}).then((res) => {
      setBotUrl(res.url);
      const intro = res.enabled ? res.welcome : res.offlineMessage;
      setMessages((current) =>
        current.length
          ? current
          : [
              {
                id: crypto.randomUUID(),
                role: "assistant",
                parts: [{ type: "text", text: intro }],
              },
            ],
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void readQuota({}).then(setQuota);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, status]);

  const turns: Turn[] = messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    return content ? [{ role: message.role, content }] : [];
  });

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setInput("");
    const history = turns;
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    setMessages((current) => [...current, userMessage]);
    setStatus("submitted");
    try {
      const res = await ask({ data: { question: text, history } });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "text", text: res.ok ? res.reply : `تعذّر الرد دلوقتي: ${res.message}` }],
        },
      ]);
      setStatus(res.ok ? "ready" : "error");
      void readQuota({}).then(setQuota);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [{ type: "text", text: "حصل خطأ في الاتصال، جرّب تاني." }],
        },
      ]);
      setStatus("error");
    } finally {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="fixed bottom-4 end-4 z-40 h-14 w-14 overflow-visible rounded-full border-0 bg-transparent shadow-none hover:bg-transparent sm:bottom-5 sm:end-5 sm:h-16 sm:w-16"
          aria-label="AI Assistant & Support"
        >
          <AICoreIcon size={56} ariaLabel="AI Assistant" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side={dir === "rtl" ? "right" : "left"}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="relative flex items-center justify-center">
            <AICoreIcon size={40} ariaLabel="AI Assistant" />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-sm">AI Assistant &amp; Support</SheetTitle>
            <p className="truncate text-[11px] text-muted-foreground">
              بيقرأ بيانات حسابك ويجاوبك عليها
            </p>
          </div>
        </div>

        <Conversation className="min-h-0">
          <ConversationContent className="gap-6 px-4 py-5">
            {messages.length === 0 ? (
              <ConversationEmptyState className="items-stretch justify-start p-0 text-start">
                <p className="text-xs leading-6 text-muted-foreground">
                  اسأل عن الدرجات، المواعيد، الغياب، حالة المزامنة، أو ابعت مشكلة واقتراح.
                </p>
                <div className="grid gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void send(suggestion)}
                      className="h-auto justify-start whitespace-normal py-2 text-start text-xs font-normal"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </ConversationEmptyState>
            ) : null}

            {messages.map((message) => (
              <Message key={message.id} from={message.role} className="max-w-[92%]">
                <MessageContent
                  className={
                    message.role === "user"
                      ? "rounded-2xl bg-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-foreground"
                      : "w-full text-[13px] leading-relaxed"
                  }
                >
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      message.role === "assistant" ? (
                        <MessageResponse
                          key={`${message.id}-${index}`}
                          dir="auto"
                          className="[unicode-bidi:plaintext] [&_li]:my-1 [&_li]:[unicode-bidi:plaintext] [&_p]:my-1.5 [&_p]:[unicode-bidi:plaintext] [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:space-y-1 [&_ul]:ps-4"
                        >
                          {part.text}
                        </MessageResponse>
                      ) : (
                        <span
                          key={`${message.id}-${index}`}
                          dir="auto"
                          className="block whitespace-pre-wrap [unicode-bidi:plaintext]"
                        >
                          {part.text}
                        </span>
                      )
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))}

            {status === "submitted" ? (
              <Message from="assistant">
                <MessageContent className="py-1 text-xs">
                  <Shimmer>براجع بيانات حسابك…</Shimmer>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="space-y-2 border-t border-border p-3">
          <PromptInput
            onSubmit={({ text }) => void send(text)}
            className="[&_[data-slot=input-group]]:rounded-md"
          >
            <PromptInputTextarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="اكتب سؤالك…"
              className="min-h-14 text-xs leading-6"
              disabled={busy}
            />
            <PromptInputFooter className="justify-end px-2 pb-2">
              <PromptInputSubmit status={status} disabled={busy || !input.trim()} />
            </PromptInputFooter>
          </PromptInput>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTicketOpen(true)}
              className="h-7 gap-1.5 px-2 text-[11px]"
            >
              <Ticket className="size-3.5" />
              فتح تذكرة دعم
            </Button>
            {quota ? (
              <p className="text-[10px] leading-4 text-muted-foreground">
                {quota.chat.limit > 0
                  ? `أسئلة متاحة: ${quota.chat.remaining}/${quota.chat.limit}`
                  : "أسئلة متاحة: بلا حدود"}
                {quota.chat.limit > 0 && quota.chat.remaining === 0
                  ? ` • تتجدد ${quota.chat.resetLabel}`
                  : ""}
                {quota.ticket.limit > 0
                  ? ` • تذاكر: ${quota.ticket.remaining}/${quota.ticket.limit}`
                  : " • تذاكر: بلا حدود"}
              </p>
            ) : null}
          </div>
          {botUrl ? (
            <a
              href={botUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              أو كلّم AI Assistant & Support على تليجرام
            </a>
          ) : null}
        </div>
      </SheetContent>

      <TicketFormDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        remaining={quota?.ticket.remaining ?? 0}
        limit={quota?.ticket.limit ?? 2}
        resetLabel={quota?.ticket.resetLabel ?? ""}
        onFiled={(reply) => {
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              parts: [{ type: "text", text: reply }],
            },
          ]);
          void readQuota({}).then(setQuota);
        }}
      />
    </Sheet>
  );
}
