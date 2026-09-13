/**
 * Tools the support assistant can call.
 *
 * Read tools answer questions from the student's own rows; action tools do
 * exactly what the student asked for in the conversation. Everything is
 * scoped to one `userId` — no cross-account access, no credentials, no admin
 * surface.
 *
 * Schemas are strict-compatible for the gateway Responses API: every property
 * is required and optional inputs are `.nullable()` (never `.optional()`).
 */
import { tool } from "ai";
import { z } from "zod";

import type { RegistrationOption } from "@/server/dulms/registration";
import {
  archivedItems,
  listWatches,
  recentNotifications,
  searchItems,
  syncHistory,
  upcomingDeadlines,
} from "./data.server";

const text = (value: string) => value.slice(0, 12_000);

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064b-\u0652]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim();
}

async function accountFor(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("dulms_accounts")
    .select("dulms_id, password_ciphertext, key_version")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Live registration snapshot, memoised for the lifetime of one answer. */
function snapshotLoader(userId: string) {
  let cached: Promise<readonly RegistrationOption[]> | null = null;
  return () => {
    cached ??= (async () => {
      const account = await accountFor(userId);
      if (!account) throw new Error("الحساب مش مربوط بالبوابة.");
      const { ensureKeyring } = await import("@/server/crypto.server");
      const { readAccountPassword } = await import("@/server/credentials.server");
      const { readRegistrationSnapshot } = await import("@/server/dulms/registration");
      await ensureKeyring();
      const snapshot = await readRegistrationSnapshot(
        account.dulms_id,
        readAccountPassword(account.password_ciphertext, account.key_version),
      );
      return snapshot.options;
    })();
    return cached;
  };
}

function optionLine(option: RegistrationOption): string {
  return `- ${option.courseCode ?? ""} ${option.courseName} | ${option.label} | ${
    option.blocked ? "مقفول" : option.free > 0 ? `مفتوح (${option.free} مكان)` : "ممتلئ"
  }`;
}

function exactSelection(option: RegistrationOption, query: string): boolean {
  const wanted = norm(query).split(" ").filter(Boolean);
  const words = norm(
    `${option.label} ${option.groupName} ${option.subgroupName ?? ""} ${option.kind}`,
  ).split(" ");
  return wanted.length > 0 && wanted.every((word) => words.includes(word));
}

/** Matches a free-text course + group the student mentioned to a real option. */
export function matchOption(
  options: readonly RegistrationOption[],
  course: string,
  group: string,
): RegistrationOption | null {
  const courseKey = norm(course);
  const byCourse = options.filter((option) => {
    const haystack = norm(`${option.courseCode ?? ""} ${option.courseName}`);
    return haystack.includes(courseKey) || courseKey.includes(haystack);
  });
  const pool = byCourse.length ? byCourse : options;

  // Group names are often a single letter ("C"), so match whole words: a bare
  // substring check would find that "c" inside "lecture".
  const wanted = norm(group).split(" ").filter(Boolean);
  const score = (option: RegistrationOption) => {
    const words = norm(
      `${option.label} ${option.groupName} ${option.subgroupName ?? ""} ${option.kind}`,
    ).split(" ");
    return wanted.filter((word) => words.includes(word)).length;
  };

  let best: RegistrationOption | null = null;
  let bestScore = 0;
  let tied = false;
  for (const option of pool) {
    const value = score(option);
    if (value > bestScore) {
      best = option;
      bestScore = value;
      tied = false;
    } else if (value > 0 && value === bestScore) {
      tied = true;
    }
  }
  if (tied) {
    const exact = pool.filter((option) => exactSelection(option, group));
    return exact.length === 1 ? exact[0]! : null;
  }
  return bestScore === wanted.length && wanted.length > 0 ? best : bestScore > 0 ? best : null;
}

export function buildSupportTools(options: {
  userId: string | null;
  channel: "web" | "telegram";
  chatId: string | null;
  ticketsEnabled: boolean;
}) {
  const { userId, channel, chatId } = options;
  const needsAccount = "الطالب مش مربوط بحساب DULMS، اطلب منه يربط حسابه الأول.";
  const loadOptions = userId ? snapshotLoader(userId) : null;

  const readTools = {
    search_student_data: tool({
      description:
        "بحث في كل بيانات الطالب من البوابة (درجات، أعمال سنة، كويزات، تكليفات، جدول، غياب، حضور، إنذارات، إعلانات، تسجيل). استخدمها لأي سؤال عن بيانات.",
      inputSchema: z.object({
        kinds: z
          .array(z.string())
          .nullable()
          .describe(
            "أنواع للتصفية: gradebook, quiz, assignment, schedule, absence, attendance, warning, notice, event, registration, courseOffer, profile",
          ),
        query: z.string().nullable().describe("كلمة بحث في اسم العنصر أو المادة"),
        limit: z.number().nullable(),
      }),
      execute: async (input) => (userId ? text(await searchItems(userId, input)) : needsAccount),
    }),
    get_upcoming_deadlines: tool({
      description: "المواعيد القادمة فقط (كويزات/تكليفات/أحداث لسه ما فاتتش).",
      inputSchema: z.object({ limit: z.number().nullable() }),
      execute: async ({ limit }) =>
        userId ? text(await upcomingDeadlines(userId, limit)) : needsAccount,
    }),
    get_notifications: tool({
      description: "آخر الإشعارات اللي اتبعتت للطالب وحالة القراءة.",
      inputSchema: z.object({ limit: z.number().nullable() }),
      execute: async ({ limit }) =>
        userId ? text(await recentNotifications(userId, limit)) : needsAccount,
    }),
    get_sync_history: tool({
      description: "سجل عمليات المزامنة الأخيرة وأخطاؤها — لأسئلة «المزامنة شغالة؟».",
      inputSchema: z.object({ limit: z.number().nullable() }),
      execute: async ({ limit }) =>
        userId ? text(await syncHistory(userId, limit)) : needsAccount,
    }),
    get_archived_items: tool({
      description: "عناصر اختفت من البوابة (مؤرشفة) — للمقارنة التاريخية.",
      inputSchema: z.object({ limit: z.number().nullable() }),
      execute: async ({ limit }) =>
        userId ? text(await archivedItems(userId, limit)) : needsAccount,
    }),
    list_registration_watches: tool({
      description: "المتابعات الحالية لجروبات التسجيل بحالتها ومعرّفها (id) ونتيجتها الأخيرة.",
      inputSchema: z.object({}),
      execute: async () => (userId ? text(await listWatches(userId)) : needsAccount),
    }),
    list_registration_offers: tool({
      description:
        "قراءة مباشرة من البوابة للمقررات والجروبات المتاحة للتسجيل وحالة فتحها وعدد الأماكن. أبطأ من باقي الأدوات، استخدمها فقط لما السؤال عن التسجيل.",
      inputSchema: z.object({ course: z.string().nullable().describe("كود أو اسم مادة للتصفية") }),
      execute: async ({ course }) => {
        if (!loadOptions) return needsAccount;
        try {
          const all = await loadOptions();
          const key = course ? norm(course) : null;
          const filtered = key
            ? all.filter((option) =>
                norm(`${option.courseCode ?? ""} ${option.courseName}`).includes(key),
              )
            : all;
          if (!filtered.length) return "لا توجد مقررات مطابقة معروضة للتسجيل الآن.";
          return text(filtered.slice(0, 120).map(optionLine).join("\n"));
        } catch (error) {
          return `تعذّر قراءة بيانات التسجيل من البوابة: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    }),
    calculate_gpa: tool({
      description:
        "حساب المعدل التراكمي المتوقع بعد مقررات جديدة، أو المعدل المطلوب للوصول لتراكمي معيّن، أو كل احتمالات التقديرات. استخدمها لأي سؤال «لو جبت كذا هيبقى تراكمي كام». سلم النقاط الافتراضي 4.0 (A/A+ = 4، A- = 3.7، B+ = 3.3، B = 3، B- = 2.7، C+ = 2.3، C = 2، C- = 1.7، D+ = 1.3، D = 1، F = 0) ويقدر الطالب يعدّله.",
      inputSchema: z.object({
        current_cgpa: z.number().describe("التراكمي الحالي"),
        current_hours: z.number().describe("الساعات المحتسبة في التراكمي"),
        courses: z
          .array(
            z.object({
              name: z.string().nullable(),
              hours: z.number(),
              grade: z.string().nullable().describe("تقدير مثل A- أو رقم نقاط"),
            }),
          )
          .describe("المقررات الجديدة وساعاتها"),
        target_cgpa: z.number().nullable().describe("تراكمي مستهدف لحساب المطلوب"),
        letters: z
          .array(z.string())
          .nullable()
          .describe("تقديرات لتوليد كل الاحتمالات، مثل [A, A-, B+]"),
        scale: z
          .array(z.object({ grade: z.string(), points: z.number() }))
          .nullable()
          .describe("سلم نقاط بديل من لائحة الطالب"),
      }),
      execute: async (input) => {
        const { projectCgpa, requiredAverage, gradeCombinations } = await import("./gpa");
        const scale = input.scale
          ? Object.fromEntries(input.scale.map((row) => [row.grade.toUpperCase(), row.points]))
          : undefined;
        const courses = input.courses.map((course) => ({
          name: course.name,
          hours: course.hours,
          grade: course.grade ?? "",
        }));
        const parts: string[] = [];

        if (courses.some((course) => course.grade)) {
          const result = projectCgpa({
            currentCgpa: input.current_cgpa,
            currentHours: input.current_hours,
            courses,
            scale,
          });
          parts.push(
            `التراكمي المتوقع: ${result.newCgpa} على ${result.newHours} ساعة (معدل الفصل ${result.termGpa ?? "—"})`,
            ...result.lines,
          );
          if (result.unknownGrades.length)
            parts.push(`تقديرات غير معروفة: ${result.unknownGrades.join(", ")}`);
        }

        const newHours = courses.reduce((sum, course) => sum + course.hours, 0);
        if (input.target_cgpa !== null && newHours > 0) {
          const need = requiredAverage(
            input.current_cgpa,
            input.current_hours,
            newHours,
            input.target_cgpa,
          );
          parts.push(
            `للوصول لتراكمي ${input.target_cgpa} محتاج متوسط ${need.average} نقطة/ساعة على الـ${newHours} ساعة${
              need.reachable ? "" : ` — مستحيل، الأقصى ${need.max}`
            }`,
          );
        }

        if (input.letters?.length) {
          const combos = gradeCombinations({
            currentCgpa: input.current_cgpa,
            currentHours: input.current_hours,
            courses: courses.map((course) => ({ name: course.name, hours: course.hours })),
            letters: input.letters,
            scale,
          });
          parts.push(
            "أفضل الاحتمالات:",
            ...combos.map((combo) => `${combo.grades.join(" / ")} ← ${combo.cgpa}`),
          );
        }

        return parts.length ? text(parts.join("\n")) : "محتاج تقديرات أو تراكمي مستهدف للحساب.";
      },
    }),
    recommend_schedule: tool({
      description:
        "اقتراح أفضل جدول ممكن: يختار أنسب جروب/سكشن لكل مادة بحيث تكون أيام الحضور أقل ما يمكن، ومتتالية بدون يوم فاضي بينها، وأقل انتظار بين المحاضرات وبدون تعارض. استخدمها لأي سؤال عن أفضل جدول أو أفضل جروبات.",
      inputSchema: z.object({
        only_open: z.boolean().nullable().describe("الاكتفاء بالجروبات المفتوحة حاليًا فقط"),
        courses: z
          .array(z.string())
          .nullable()
          .describe("أكواد/أسماء مواد محددة، أو null لكل المواد المعروضة"),
      }),
      execute: async ({ only_open, courses }) => {
        if (!userId || !loadOptions) return needsAccount;
        try {
          const all = await loadOptions();
          const { recommendSchedule, formatRecommendation } =
            await import("@/server/dulms/schedule-optimizer");
          let courseIds: string[] | undefined;
          if (courses?.length) {
            const keys = courses.map(norm);
            courseIds = [
              ...new Set(
                all
                  .filter((option) => {
                    const haystack = norm(`${option.courseCode ?? ""} ${option.courseName}`);
                    return keys.some((key) => haystack.includes(key) || key.includes(haystack));
                  })
                  .map((option) => option.courseId),
              ),
            ];
          }
          const result = recommendSchedule(all, {
            onlyOpen: only_open ?? false,
            courseIds,
          });
          const picks = result.picks
            .map(
              (pick) =>
                `- ${pick.courseCode ?? pick.courseName}: ${pick.label}${pick.open ? "" : " (مقفول حاليًا)"}`,
            )
            .join("\n");
          return text(
            `${formatRecommendation(result)}\n\nالاختيار المقترح لكل مادة:\n${picks}\n\nلو الطالب وافق، فعّل المتابعة لكل جروب بـ watch_group.`,
          );
        } catch (error) {
          return `تعذّر بناء الجدول: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
  };

  const actionTools = {
    watch_group: tool({
      description:
        "تفعيل متابعة جروب/سكشن في مادة، مع التسجيل التلقائي عند فتحه. نفّذها فقط بعد ما الطالب يطلبها أو يوافق صراحةً.",
      inputSchema: z.object({
        course: z.string().describe("كود أو اسم المادة، مثال GEN403"),
        group: z.string().describe("اسم الجروب/السكشن، مثال Lecture C أو C"),
        auto_register: z.boolean().nullable().describe("تسجيل تلقائي (الافتراضي true)"),
      }),
      execute: async ({ course, group, auto_register }) => {
        if (!userId || !loadOptions) return needsAccount;
        try {
          const all = await loadOptions();
          const { registrationSelections } = await import("@/server/dulms/registration");
          const choices = registrationSelections(all);
          const option = matchOption(choices, course, group);
          if (!option) {
            return `مش لاقي اختيار محاضرة وسكشن مطابق لـ «${course} ${group}». الاختيارات الصحيحة:\n${choices
              .slice(0, 40)
              .map(optionLine)
              .join("\n")}`;
          }
          const { startRegistrationWatch } = await import("@/server/dulms/watch-create.server");
          const outcome = await startRegistrationWatch(userId, {
            courseId: option.courseId,
            groupId: option.groupId,
            subgroupId: option.subgroupId,
            autoRegister: auto_register ?? true,
          });
          return `تم تفعيل المتابعة على ${option.courseCode ?? option.courseName} — ${option.label}${
            auto_register === false ? " (يدوي)" : " مع التسجيل التلقائي"
          }. الحالة الحالية للمحاضرة والسكشن: ${option.blocked || option.free < 1 ? "واحد منهم مقفول/ممتلئ" : "الاتنين مفتوحين"}. ${outcome.message}`;
        } catch (error) {
          return `تعذّر تفعيل المتابعة: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
    stop_watch: tool({
      description: "إيقاف متابعة جروب باستخدام id من list_registration_watches. بعد موافقة الطالب.",
      inputSchema: z.object({ watch_id: z.string() }),
      execute: async ({ watch_id }) => {
        if (!userId) return needsAccount;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("registration_watches")
          .delete()
          .eq("id", watch_id)
          .eq("user_id", userId);
        return error ? `تعذّر إيقاف المتابعة: ${error.message}` : "تم إيقاف المتابعة.";
      },
    }),
    set_auto_register: tool({
      description: "تشغيل أو إيقاف التسجيل التلقائي لمتابعة موجودة. بعد موافقة الطالب.",
      inputSchema: z.object({ watch_id: z.string(), auto_register: z.boolean() }),
      execute: async ({ watch_id, auto_register }) => {
        if (!userId) return needsAccount;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("registration_watches")
          .update({ auto_register })
          .eq("id", watch_id)
          .eq("user_id", userId);
        return error
          ? `تعذّر التعديل: ${error.message}`
          : `تم ${auto_register ? "تشغيل" : "إيقاف"} التسجيل التلقائي لهذه المتابعة.`;
      },
    }),
    run_sync_now: tool({
      description: "تشغيل مزامنة فورية للحساب مع البوابة. بعد موافقة الطالب.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!userId) return needsAccount;
        try {
          const { syncUser } = await import("@/server/sync.server");
          const result = (await syncUser(userId)) as unknown as Record<string, unknown>;
          return `تمت المزامنة. النتيجة: ${JSON.stringify(result).slice(0, 500)}`;
        } catch (error) {
          return `فشلت المزامنة: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
    open_support_ticket: tool({
      description:
        "فتح تذكرة دعم للفريق (مشكلة/اقتراح/سؤال/ملاحظة). نفّذها فقط بعد ما الطالب يوافق على فتح تذكرة.",
      inputSchema: z.object({
        kind: z.enum(["bug", "suggestion", "question", "note"]),
        title: z.string(),
        details: z.string(),
      }),
      execute: async ({ kind, title, details }) => {
        const { fileTicketForm } = await import("./tickets.server");
        const result = await fileTicketForm({
          userId,
          chatId,
          channel,
          form: { kind, title: title.slice(0, 120), details: details.slice(0, 2000) },
        });
        return result.ok ? result.reply : result.error;
      },
    }),
  };

  return options.ticketsEnabled
    ? { ...readTools, ...actionTools }
    : {
        ...readTools,
        ...Object.fromEntries(
          Object.entries(actionTools).filter(([name]) => name !== "open_support_ticket"),
        ),
      };
}
