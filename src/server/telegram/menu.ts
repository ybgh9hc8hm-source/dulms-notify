/**
 * Telegram inline-button navigation that mirrors the website sidebar:
 * groups -> categories -> item lists, all rendered from `dulms_items`.
 */
import { to12h } from "../sync/message-format";
import { appOrigin, escapeHtml } from "../telegram.server";

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
};
export type Keyboard = InlineButton[][];

export type MenuCategory = {
  id: string;
  label: string;
  kinds: string[];
  empty: string;
};

export type MenuGroup = { id: string; label: string; categories: MenuCategory[] };

const C = (id: string, label: string, kinds: string[], empty: string): MenuCategory => ({
  id,
  label,
  kinds,
  empty,
});

const MENU_GROUPS: MenuGroup[] = [
  {
    id: "elearning",
    label: "E-Learning",
    categories: [
      C("quizzes", "Quizzes", ["quiz"], "لا توجد كويزات حتى الآن"),
      C("assignments", "Assignments", ["assignment"], "لا توجد تكاليف حتى الآن"),
    ],
  },
  {
    id: "grades",
    label: "Exams & grades",
    categories: [C("gradebook", "Grades book", ["gradebook"], "لا يوجد دفتر درجات بعد")],
  },
  {
    id: "attendance",
    label: "Semester works",
    categories: [
      C("absence", "Lectures absence", ["absence"], "لا يوجد غياب — تمام كده"),
      C("warnings", "Absence warnings", ["warning"], "لا توجد إنذارات"),
      C("attendance", "Lecture attendance", ["attendance"], "لا يوجد رصد حضور بعد"),
    ],
  },
  {
    id: "comm",
    label: "Announcements",
    categories: [
      C("announcements", "Announcements", ["announcement", "notice"], "لا توجد إعلانات"),
      C("events", "Events calendar", ["event"], "لا توجد أحداث"),
    ],
  },
  {
    id: "academicReg",
    label: "Academic registration",
    categories: [C("schedule", "Studying schedule", ["schedule"], "لم نقرأ جدولك بعد")],
  },
];

function findGroup(id: string) {
  return MENU_GROUPS.find((group) => group.id === id) ?? null;
}

function findCategory(id: string): { group: MenuGroup; category: MenuCategory } | null {
  for (const group of MENU_GROUPS) {
    const category = group.categories.find((item) => item.id === id);
    if (category) return { group, category };
  }
  return null;
}

const PAGE_SIZE = 6;

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
      timeZone: "Africa/Cairo",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function rows(buttons: InlineButton[], perRow = 2): Keyboard {
  const out: Keyboard = [];
  for (let i = 0; i < buttons.length; i += perRow) out.push(buttons.slice(i, i + perRow));
  return out;
}

export type View = { text: string; keyboard: Keyboard };

/** Thin divider used to separate the header block from the body. */
const RULE = "──────────";

/** A visually grouped card. Telegram renders <blockquote> with a side bar. */
function card(lines: (string | null)[]): string {
  const body = lines.filter((line) => line !== null && line !== "").join("\n");
  return `<blockquote>${body}</blockquote>`;
}

/** "label: value" row, with the label in bold so the eye can scan the column. */
function field(label: string, value: string | null | undefined): string | null {
  const clean = (value ?? "").toString().trim();
  return clean ? `<b>${escapeHtml(label)}:</b> ${escapeHtml(clean)}` : null;
}

/** Screen title + optional subtitle, followed by a divider. */
function screenHeader(title: string, subtitle?: string | null): string {
  return [`<b>${escapeHtml(title)}</b>`, subtitle ? `<i>${escapeHtml(subtitle)}</i>` : null, RULE]
    .filter((line) => line !== null)
    .join("\n");
}

/** Root menu: student header + the same top-level groups as the website sidebar. */
export async function homeView(userId: string): Promise<View> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id, profile, last_sync_at")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = (account?.profile ?? {}) as Record<string, unknown>;
  const name = typeof profile["name"] === "string" ? (profile["name"] as string) : null;
  const level = typeof profile["level"] === "string" ? (profile["level"] as string) : null;
  const cgpa = typeof profile["cgpa"] === "string" ? (profile["cgpa"] as string) : null;

  const { count } = await supabaseAdmin
    .from("dulms_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("archived_at", null);

  const text = [
    `<b>DULMS Notify</b>`,
    RULE,
    card([
      `<b>${escapeHtml(name ?? "طالب دلتا")}</b>`,
      field("كود الطالب", account?.dulms_id),
      field("المستوى", level),
      field("المعدل التراكمي", cgpa),
      field("العناصر المتابَعة", String(count ?? 0)),
      account?.last_sync_at ? `<i>آخر مزامنة: ${fmtDate(account.last_sync_at)}</i>` : null,
    ]),
    "",
    "اختر القسم من الأزرار بالأسفل",
  ].join("\n");

  // Groups that ended up with a single category are shown as that category
  // directly — no pointless one-button screen in between.
  const keyboard = rows(
    MENU_GROUPS.map((group) =>
      group.categories.length === 1
        ? { text: group.categories[0]!.label, callback_data: `c:${group.categories[0]!.id}:0` }
        : { text: group.label, callback_data: `g:${group.id}` },
    ),
  );
  keyboard.push([
    { text: "أحدث الإشعارات", callback_data: "alerts:0" },
    { text: "تحديث", callback_data: "home" },
  ]);
  // Opens the full website as a Telegram Mini App, inside the chat.
  keyboard.push([
    { text: "فتح الموقع داخل تليجرام", web_app: { url: `${appOrigin()}/dashboard` } },
  ]);
  // Hands the student over to the standalone AI support bot.
  const { getSupportBotUsername } = await import("../support/bot.server");
  const supportBot = await getSupportBotUsername();
  if (supportBot) {
    keyboard.push([{ text: "AI Assistant & Support", url: `https://t.me/${supportBot}` }]);
  }

  return { text, keyboard };
}

export function groupView(groupId: string): View | null {
  const group = findGroup(groupId);
  if (!group) return null;
  const keyboard = rows(
    group.categories.map((category) => ({
      text: category.label,
      callback_data: `c:${category.id}:0`,
    })),
  );
  keyboard.push([{ text: "رجوع", callback_data: "home" }]);
  return {
    text: [
      screenHeader(group.label, `${group.categories.length} تصنيفات`),
      "",
      "اختر التصنيف:",
    ].join("\n"),
    keyboard,
  };
}

/** Paginated list of the items in one category, newest first. */
export async function categoryView(
  userId: string,
  categoryId: string,
  page: number,
): Promise<View | null> {
  const found = findCategory(categoryId);
  if (!found) return null;
  const { group, category } = found;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = page * PAGE_SIZE;
  const { data, count } = await supabaseAdmin
    .from("dulms_items")
    .select("kind, course, title, status, score, due_at, last_seen_at", { count: "exact" })
    .eq("user_id", userId)
    .in("kind", category.kinds)
    .is("archived_at", null)
    .order("due_at", { ascending: false, nullsFirst: false })
    .order("last_seen_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const items = data ?? [];

  const body = items.length
    ? items
        .map((item, index) =>
          card([
            `<b>${escapeHtml(`${from + index + 1}. ${to12h(item.title)}`)}</b>`,
            field("المادة", to12h(item.course)),
            field("الحالة", to12h(item.status)),
            field("الدرجة", item.score),
            item.due_at ? `<b>الموعد:</b> ${escapeHtml(fmtDate(item.due_at) ?? "")}` : null,
          ]),
        )
        .join("\n")
    : `<i>${escapeHtml(category.empty)}</i>`;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const text = [
    screenHeader(
      category.label,
      total ? `${total} عنصر · صفحة ${page + 1} من ${pages}` : group.label,
    ),
    "",
    body,
  ].join("\n");

  const nav: InlineButton[] = [];
  if (page > 0) nav.push({ text: "السابق", callback_data: `c:${category.id}:${page - 1}` });
  if (from + PAGE_SIZE < total)
    nav.push({ text: "التالي", callback_data: `c:${category.id}:${page + 1}` });

  const keyboard: Keyboard = [];
  if (nav.length) keyboard.push(nav);
  keyboard.push(
    group.categories.length === 1
      ? [{ text: "الرئيسية", callback_data: "home" }]
      : [
          { text: "رجوع", callback_data: `g:${group.id}` },
          { text: "الرئيسية", callback_data: "home" },
        ],
  );

  return { text, keyboard };
}

/** Latest in-app notifications, same feed as the website alerts panel. */
export async function alertsView(userId: string, page: number): Promise<View> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = page * PAGE_SIZE;
  const { data, count } = await supabaseAdmin
    .from("notifications")
    .select("title, body, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const items = data ?? [];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const body = items.length
    ? items
        .map((item) =>
          card([
            `<b>${escapeHtml(to12h(item.title))}</b>`,
            item.body ? escapeHtml(to12h(item.body)) : null,
            `<i>${escapeHtml(fmtDate(item.created_at) ?? "")}</i>`,
          ]),
        )
        .join("\n")
    : "<i>لا توجد إشعارات بعد</i>";

  const nav: InlineButton[] = [];
  if (page > 0) nav.push({ text: "السابق", callback_data: `alerts:${page - 1}` });
  if (from + PAGE_SIZE < total) nav.push({ text: "التالي", callback_data: `alerts:${page + 1}` });

  const keyboard: Keyboard = [];
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: "الرئيسية", callback_data: "home" }]);

  const text = [
    screenHeader("أحدث الإشعارات", total ? `${total} إشعار · صفحة ${page + 1} من ${pages}` : null),
    "",
    body,
  ].join("\n");

  return { text, keyboard };
}
