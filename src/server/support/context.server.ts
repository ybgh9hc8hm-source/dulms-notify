/**
 * Builds the account snapshot the support assistant reasons over.
 *
 * Everything here is derived from the student's own rows. Credentials
 * (password ciphertext, link tokens, session cookies) are never included.
 */

type Row = Record<string, unknown>;

const KIND_LABEL: Record<string, string> = {
  quiz: "Quizzes",
  assignment: "Assignments",
  schedule: "Studying schedule",
  absence: "Lectures absence",
  attendance: "Lecture attendance",
  notice: "Announcements",
  event: "Events calendar",
  announcement: "Announcements",
  gradebook: "Grades book",
  warning: "Absence warnings",
  registration: "Course registration",
  courseOffer: "Available courses for registration",
  profile: "Profile data",
  other: "Updates",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fmt(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
      timeZone: "Africa/Cairo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function compactExtra(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Row)
    .filter(([, entry]) => entry !== null && entry !== undefined && String(entry).trim())
    .slice(0, 12)
    .map(([key, entry]) => `${key}: ${String(entry)}`);
  return entries.length ? entries.join("؛ ") : null;
}

function itemLine(item: {
  kind: string;
  course: string | null;
  title: string;
  due_at: string | null;
  status: string | null;
  score: string | null;
  extra: unknown;
}): string {
  const details = [
    item.course ? `المادة: ${item.course}` : null,
    item.score ? `الدرجة: ${item.score}` : null,
    item.status ? `الحالة: ${item.status}` : null,
    item.due_at ? `الموعد: ${fmt(item.due_at)}` : null,
    compactExtra(item.extra),
  ].filter(Boolean);
  return `- ${item.title}${details.length ? ` | ${details.join(" | ")}` : ""}`;
}

/** Compact, token-friendly text snapshot of everything the student can see. */
export async function buildAccountContext(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [accountRes, itemsRes, archivedRes, notifsRes, logsRes] = await Promise.all([
    supabaseAdmin
      .from("dulms_accounts")
      .select(
        "dulms_id, profile, sync_enabled, last_sync_at, last_sync_status, last_sync_error, telegram_chat_id, created_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("dulms_items")
      .select("kind, course, title, due_at, status, score, extra, first_seen_at, last_seen_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("dulms_items")
      .select("kind, course, title, due_at, status, score, extra, archived_at")
      .eq("user_id", userId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(120),
    supabaseAdmin
      .from("notifications")
      .select("kind, title, body, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabaseAdmin
      .from("sync_logs")
      .select("status, message, items_found, new_items, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const account = accountRes.data;
  const profile = (account?.profile ?? {}) as Row;
  const items = itemsRes.data ?? [];
  const archived = archivedRes.data ?? [];
  const notifications = notifsRes.data ?? [];
  const logs = logsRes.data ?? [];

  const byKind = new Map<string, number>();
  for (const item of items) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);

  const lines: string[] = [];

  lines.push("## بيانات الطالب");
  lines.push(`- الاسم: ${str(profile["name"]) ?? "غير معروف"}`);
  lines.push(`- كود الطالب: ${account?.dulms_id ?? "—"}`);
  lines.push(`- المستوى: ${str(profile["level"]) ?? "—"}`);
  lines.push(`- الكلية/البرنامج: ${str(profile["faculty"]) ?? str(profile["program"]) ?? "—"}`);
  lines.push(`- المعدل التراكمي CGPA: ${str(profile["cgpa"]) ?? "—"}`);
  lines.push(`- معدل الفصل SGPA: ${str(profile["sgpa"]) ?? "—"}`);
  lines.push(`- الساعات المجتازة: ${String(profile["passedHours"] ?? "—")}`);
  lines.push(`- الساعات المطلوبة: ${String(profile["requiredHours"] ?? "—")}`);
  lines.push(`- الساعات المتبقية: ${String(profile["remainingHours"] ?? "—")}`);
  lines.push(`- المقررات المسجلة: ${str(profile["registeredCourses"]) ?? "—"}`);
  lines.push(`- تاريخ التسجيل في الموقع: ${fmt(account?.created_at)}`);

  lines.push("");
  lines.push("## حالة المزامنة والإشعارات");
  lines.push(`- المزامنة مفعّلة: ${account?.sync_enabled ? "نعم" : "لا"}`);
  lines.push(`- آخر مزامنة: ${fmt(account?.last_sync_at)} (${account?.last_sync_status ?? "—"})`);
  if (account?.last_sync_error) lines.push(`- آخر خطأ مزامنة: ${account.last_sync_error}`);
  lines.push(`- التليجرام مربوط: ${account?.telegram_chat_id ? "نعم" : "لا"}`);
  for (const log of logs) {
    lines.push(
      `- سجل ${fmt(log.created_at)}: ${log.status} — عناصر ${log.items_found}، جديد ${log.new_items}${
        log.message ? ` — ${log.message}` : ""
      }`,
    );
  }

  lines.push("");
  lines.push(`## ملخص العناصر الحالية (${items.length} عنصر)`);
  for (const [kind, count] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${KIND_LABEL[kind] ?? kind}: ${count}`);
  }

  const now = Date.now();
  const upcoming = items
    .filter((item) => item.due_at && new Date(item.due_at).getTime() > now)
    .sort((a, b) => new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime())
    .slice(0, 25);
  if (upcoming.length > 0) {
    lines.push("");
    lines.push("## المواعيد القادمة");
    for (const item of upcoming) {
      lines.push(itemLine(item));
    }
  }

  const academicKinds = ["gradebook", "quiz", "assignment"];
  const academicItems = items.filter((item) => academicKinds.includes(item.kind));
  if (academicItems.length > 0) {
    lines.push("");
    lines.push("## البيانات الأكاديمية — المصادر منفصلة ولا يجوز خلطها");
    for (const kind of academicKinds) {
      const group = academicItems.filter((item) => item.kind === kind);
      if (!group.length) continue;
      lines.push(`### ${KIND_LABEL[kind] ?? kind} [المصدر: ${kind}]`);
      for (const item of group.slice(0, 120)) lines.push(itemLine(item));
    }
  }

  const attendanceKinds = ["absence", "attendance", "warning"];
  const attendanceItems = items.filter((item) => attendanceKinds.includes(item.kind));
  if (attendanceItems.length > 0) {
    lines.push("");
    lines.push("## الحضور والغياب والإنذارات");
    for (const item of attendanceItems.slice(0, 160)) lines.push(itemLine(item));
  }

  const coveredKinds = new Set([...academicKinds, ...attendanceKinds]);
  const otherItems = items.filter((item) => !coveredKinds.has(item.kind));
  if (otherItems.length > 0) {
    lines.push("");
    lines.push("## بقية بيانات البوابة الحالية");
    for (const kind of [...new Set(otherItems.map((item) => item.kind))]) {
      lines.push(`### ${KIND_LABEL[kind] ?? kind} [المصدر: ${kind}]`);
      for (const item of otherItems.filter((entry) => entry.kind === kind).slice(0, 80)) {
        lines.push(itemLine(item));
      }
    }
  }

  if (archived.length > 0) {
    lines.push("");
    lines.push(`## عناصر مؤرشفة/اختفت من البوابة (${archived.length} الأحدث فقط)`);
    for (const item of archived) lines.push(itemLine(item));
  }

  if (notifications.length > 0) {
    lines.push("");
    lines.push("## آخر الإشعارات");
    for (const notification of notifications) {
      lines.push(
        `- ${fmt(notification.created_at)} [${notification.kind}] ${notification.title}${
          notification.body ? ` — ${notification.body}` : ""
        }${notification.read_at ? "" : " (غير مقروء)"}`,
      );
    }
  }

  return lines.join("\n");
}
