/**
 * Mandatory Telegram linking gate.
 * The dashboard stays blocked behind this overlay until the student links their
 * Telegram account; the status is re-polled so the gate lifts automatically
 * right after they press Start in the bot.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { DeltaMark } from "@/components/brand/DeltaMark";
import { Button } from "@/components/ui/button";
import { createTelegramLink, getTelegramStatus } from "@/lib/telegram.functions";
import { useI18n } from "@/lib/i18n";

const LINK_TOAST_ID = "telegram-link";

interface Props {
  onSignOut: () => void;
}

export function TelegramGate({ onSignOut }: Props) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const text = useCallback((arabic: string, english: string) => (ar ? arabic : english), [ar]);
  const status = useServerFn(getTelegramStatus);
  const link = useServerFn(createTelegramLink);
  const queryClient = useQueryClient();

  const { data, isPending, refetch } = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => status(),
    refetchInterval: (query) => (query.state.data?.connected ? false : 12_000),
    refetchOnWindowFocus: true,
  });

  const promptedRef = useRef(false);

  useEffect(() => {
    if (!data?.connected) return;
    // The pending "open the bot" toast is no longer true once linking succeeded.
    toast.dismiss(LINK_TOAST_ID);
    if (promptedRef.current) {
      promptedRef.current = false;
      toast.success(text("تم ربط تليجرام بنجاح", "Telegram linked successfully"), {
        description: text(
          "هتوصلك كل الإشعارات على المحادثة دي.",
          "Notifications will arrive in this chat.",
        ),
      });
    }
  }, [data?.connected, text]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await link();
      if (!res.ok) throw new Error(res.message);
      return res.url;
    },
    onSuccess: (url) => {
      window.open(url, "_blank", "noopener");
      promptedRef.current = true;
      toast.info(text("في انتظار تأكيد الربط", "Waiting for confirmation"), {
        id: LINK_TOAST_ID,
        duration: Infinity,
        description: text(
          "افتح محادثة البوت في تليجرام واضغط Start — الربط هيكتمل تلقائيًا.",
          "Open the Telegram bot and press Start. Linking will complete automatically.",
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (error: Error) =>
      toast.error(text("تعذر إنشاء رابط الربط", "Could not create the link"), {
        description: error.message || text("حاول مرة أخرى بعد لحظات.", "Please try again shortly."),
      }),
  });

  if (isPending || data?.connected) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 px-4 backdrop-blur">
      <div className="card-elevated w-full max-w-md p-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <DeltaMark className="size-9" />
        </div>
        <h2 className="mt-4 text-xl font-bold">
          {text("ربط تليجرام مطلوب", "Telegram link required")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {text(
            "لازم تربط حسابك بتليجرام عشان تستقبل الإشعارات وتقدر تستخدم لوحتك. اضغط الزر، افتح المحادثة مع البوت واضغط Start.",
            "Link Telegram to receive alerts and use your dashboard. Open the bot, then press Start.",
          )}
        </p>

        <Button
          className="mt-5 w-full"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {text("ربط تليجرام الآن", "Link Telegram now")}
        </Button>

        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              const res = await refetch();
              if (!res.data?.connected) {
                toast.info(text("لسه مفيش ربط", "Not linked yet"), {
                  description: text(
                    "افتح محادثة البوت واضغط Start، وبعدها اضغط تحقّق تاني.",
                    "Open the bot, press Start, then check again.",
                  ),
                });
              }
            }}
          >
            {text("تحقّق من الربط", "Check link")}
          </Button>

          <Button variant="ghost" className="flex-1" onClick={onSignOut}>
            {text("تسجيل الخروج", "Sign out")}
          </Button>
        </div>
      </div>
    </div>
  );
}
