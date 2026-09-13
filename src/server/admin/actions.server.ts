import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AccountActionName =
  | "enable"
  | "disable"
  | "unlinkTelegram"
  | "syncNow"
  | "testMessage"
  | "directMessage"
  | "resetFailures"
  | "delete";

export type ActionResult = { ok: boolean; message: string };

/**
 * Executes one operator action against a single linked account.
 * Never throws: every failure is returned as { ok: false } so bulk runs can continue.
 */
export async function runAccountAction(
  dulmsId: string,
  action: AccountActionName,
  text?: string,
): Promise<ActionResult> {
  try {
    const { data: account, error } = await supabaseAdmin
      .from("dulms_accounts")
      .select("user_id, telegram_chat_id")
      .eq("dulms_id", dulmsId)
      .maybeSingle();
    if (error) return { ok: false, message: `${dulmsId}: تعذّر قراءة الحساب` };
    if (!account?.user_id) return { ok: false, message: `${dulmsId}: الحساب غير موجود` };

    switch (action) {
      case "enable":
      case "disable": {
        const { error: updateError } = await supabaseAdmin
          .from("dulms_accounts")
          .update({ sync_enabled: action === "enable" })
          .eq("user_id", account.user_id);
        if (updateError) return { ok: false, message: `${dulmsId}: تعذّر التحديث` };
        return {
          ok: true,
          message: action === "enable" ? "تم تفعيل المزامنة" : "تم إيقاف المزامنة",
        };
      }
      case "unlinkTelegram": {
        if (!account.telegram_chat_id) {
          return { ok: true, message: `${dulmsId}: غير مربوط أصلًا` };
        }
        const { error: updateError } = await supabaseAdmin
          .from("dulms_accounts")
          .update({ telegram_chat_id: null })
          .eq("user_id", account.user_id);
        if (updateError) return { ok: false, message: `${dulmsId}: تعذّر فك الربط` };
        return { ok: true, message: "تم فك ربط تليجرام" };
      }
      case "resetFailures": {
        const { error: updateError } = await supabaseAdmin
          .from("dulms_accounts")
          .update({ check_failures: 0, last_sync_error: null })
          .eq("user_id", account.user_id);
        if (updateError) return { ok: false, message: `${dulmsId}: تعذّر التصفير` };
        return { ok: true, message: "تم تصفير عدّاد الأخطاء" };
      }
      case "syncNow": {
        const { syncUser } = await import("@/server/sync/sync-user");
        const result = await syncUser(account.user_id);
        return { ok: true, message: `${dulmsId}: ${result.message}` };
      }
      case "testMessage":
      case "directMessage": {
        if (!account.telegram_chat_id) {
          return { ok: false, message: `${dulmsId}: غير مربوط بتليجرام` };
        }
        const { getBotConfig } = await import("@/server/admin/settings.server");
        const { sendTelegramToUser } = await import("@/server/telegram.server");
        const { formatMessage, categoryLabel, nowLine } =
          await import("@/server/sync/message-format");
        const config = await getBotConfig();
        const body =
          action === "directMessage" ? (text ?? "").trim() : "هذا مثال على شكل الرسائل الحالي";
        if (!body) return { ok: false, message: `${dulmsId}: نص الرسالة فارغ` };
        const res = await sendTelegramToUser(
          account.user_id,
          formatMessage(
            {
              category: categoryLabel("announcement", config),
              context:
                action === "directMessage" ? "رسالة من الإدارة" : "رسالة تجريبية من لوحة التحكم",
              detail: body,
              time: nowLine(),
            },
            config,
          ),
        );
        return res.sent > 0
          ? { ok: true, message: `${dulmsId}: تم الإرسال` }
          : { ok: false, message: `${dulmsId}: تعذّر الإرسال` };
      }
      case "delete": {
        await supabaseAdmin.from("dulms_accounts").delete().eq("user_id", account.user_id);
        await supabaseAdmin.auth.admin.deleteUser(account.user_id);
        return { ok: true, message: `${dulmsId}: تم حذف الحساب` };
      }
      default:
        return { ok: false, message: "إجراء غير معروف" };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "خطأ غير متوقع";
    return { ok: false, message: `${dulmsId}: ${detail.slice(0, 120)}` };
  }
}
