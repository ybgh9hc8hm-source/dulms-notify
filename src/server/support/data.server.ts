/**
 * Read side of the support assistant.
 *
 * Every query is hard-scoped to one `userId`. Credentials (password
 * ciphertext, key version, link tokens, cookies) are never selected here, so a
 * tool can't leak them even if the model asks for them.
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

export const ITEM_KINDS = Object.keys(KIND_LABEL);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function fmtTime(value: string | null | undefined): string {
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

type Item = {
  kind: string;
  course: string | null;
  title: string;
  due_at: string | null;
  status: string | null;
  score: string | null;
  extra: unknown;
};

export function itemLine(item: Item): string {
  const details = [
    item.course ? `المادة: ${item.course}` : null,
    item.score ? `الدرجة: ${item.score}` : null,
    item.status ? `الحالة: ${item.status}` : null,
    item.due_at ? `الموعد: ${fmtTime(item.due_at)}` : null,
    compactExtra(item.extra),
  ].filter(Boolean);
  return `- [${KIND_LABEL[item.kind] ?? item.kind}] ${item.title}${
    details.length ? ` | ${details.join(" | ")}` : ""
  }`;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Short, always-injected snapshot. Detail lives behind the tools so a single
 * question doesn't drag the whole account through the model.
 */
export async function buildAccountSummary(userId: string): Promise<string> {
  const db = await admin();
  const [accountRes, itemsRes, watchesRes, unreadRes] = await Promise.all([
    db
      .from("dulms_accounts")
      .select(
        "dulms_id, profile, sync_enabled, last_sync_at, last_sync_status, last_sync_error, telegram_chat_id, created_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    db.from("dulms_items").select("kind").eq("user_id", userId).is("archived_at", null).limit(2000),
    db
      .from("registration_watches")
      .select("id, course_code, course_name, group_name, subgroup_name, status, auto_register")
      .eq("user_id", userId),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);

  const account = accountRes.data;
  const profile = (account?.profile ?? {}) as Row;
  const byKind = new Map<string, number>();
  for (const item of itemsRes.data ?? []) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);

  const lines = [
    "## ملخص الحساب",
    `- الاسم: ${str(profile["name"]) ?? "غير معروف"} | كود الطالب: ${account?.dulms_id ?? "—"}`,
    `- المستوى: ${str(profile["level"]) ?? "—"} | الكلية: ${
      str(profile["faculty"]) ?? str(profile["program"]) ?? "—"
    }`,
    `- CGPA: ${str(profile["cgpa"]) ?? "—"} | SGPA: ${str(profile["sgpa"]) ?? "—"} | ساعات مجتازة: ${String(
      profile["passedHours"] ?? "—",
    )}`,
    `- المزامنة: ${account?.sync_enabled ? "مفعّلة" : "متوقفة"} | آخر مزامنة: ${fmtTime(
      account?.last_sync_at,
    )} (${account?.last_sync_status ?? "—"})${
      account?.last_sync_error ? ` | آخر خطأ: ${account.last_sync_error}` : ""
    }`,
    `- تليجرام مربوط: ${account?.telegram_chat_id ? "نعم" : "لا"} | إشعارات غير مقروءة: ${unreadRes.count ?? 0}`,
    `- عناصر متاحة للبحث: ${[...byKind.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => `${KIND_LABEL[kind] ?? kind}=${count}`)
      .join("، ")}`,
  ];

  const watches = watchesRes.data ?? [];
  lines.push(
    watches.length
      ? `- متابعات التسجيل (${watches.length}): ${watches
          .map(
            (watch) =>
              `${watch.course_code ?? watch.course_name} ${
                watch.subgroup_name ?? watch.group_name
              } [${watch.status}${watch.auto_register ? "، تلقائي" : "، يدوي"}]`,
          )
          .join(" | ")}`
      : "- متابعات التسجيل: لا يوجد",
  );

  return lines.join("\n");
}

/** Free-text search across the student's own portal items. */
export async function searchItems(
  userId: string,
  input: { kinds?: string[] | null; query?: string | null; limit?: number | null },
): Promise<string> {
  const db = await admin();
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 200);
  let request = db
    .from("dulms_items")
    .select("kind, course, title, due_at, status, score, extra, last_seen_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  const kinds = (input.kinds ?? []).filter((kind) => ITEM_KINDS.includes(kind));
  if (kinds.length) request = request.in("kind", kinds);
  const query = input.query?.trim();
  if (query) request = request.or(`title.ilike.%${query}%,course.ilike.%${query}%`);

  const { data, error } = await request;
  if (error) return `تعذّر قراءة البيانات: ${error.message}`;
  if (!data?.length) return "لا توجد عناصر مطابقة في بيانات الطالب.";
  return data.map(itemLine).join("\n");
}

/** Deadlines still ahead of now. */
export async function upcomingDeadlines(userId: string, limit?: number | null): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("dulms_items")
    .select("kind, course, title, due_at, status, score, extra")
    .eq("user_id", userId)
    .is("archived_at", null)
    .not("due_at", "is", null)
    .gte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(Math.min(Math.max(limit ?? 20, 1), 100));
  return data?.length ? data.map(itemLine).join("\n") : "لا توجد مواعيد قادمة مسجّلة.";
}

export async function recentNotifications(userId: string, limit?: number | null): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("notifications")
    .select("kind, title, body, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit ?? 15, 1), 50));
  return data?.length
    ? data
        .map(
          (row) =>
            `- ${fmtTime(row.created_at)} [${row.kind}] ${row.title}${
              row.body ? ` — ${row.body}` : ""
            }${row.read_at ? "" : " (غير مقروء)"}`,
        )
        .join("\n")
    : "لا توجد إشعارات.";
}

export async function syncHistory(userId: string, limit?: number | null): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("sync_logs")
    .select("status, message, items_found, new_items, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit ?? 10, 1), 40));
  return data?.length
    ? data
        .map(
          (row) =>
            `- ${fmtTime(row.created_at)}: ${row.status} — عناصر ${row.items_found}، جديد ${
              row.new_items
            }${row.message ? ` — ${row.message}` : ""}`,
        )
        .join("\n")
    : "لا توجد سجلات مزامنة.";
}

export async function archivedItems(userId: string, limit?: number | null): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("dulms_items")
    .select("kind, course, title, due_at, status, score, extra, archived_at")
    .eq("user_id", userId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(Math.min(Math.max(limit ?? 30, 1), 120));
  return data?.length ? data.map(itemLine).join("\n") : "لا توجد عناصر مؤرشفة.";
}

export async function listWatches(userId: string): Promise<string> {
  const db = await admin();
  const { data } = await db
    .from("registration_watches")
    .select(
      "id, course_code, course_name, group_name, subgroup_name, status, auto_register, last_result, last_checked_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data?.length
    ? data
        .map(
          (watch) =>
            `- id=${watch.id} | ${watch.course_code ?? ""} ${watch.course_name} | ${
              watch.subgroup_name ?? watch.group_name
            } | الحالة: ${watch.status} | تلقائي: ${watch.auto_register ? "نعم" : "لا"}${
              watch.last_result ? ` | آخر نتيجة: ${watch.last_result}` : ""
            } | آخر فحص: ${fmtTime(watch.last_checked_at)}`,
        )
        .join("\n")
    : "لا توجد متابعات تسجيل.";
}
