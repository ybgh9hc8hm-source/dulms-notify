/**
 * Support assistant brain, shared by the in-site chat widget and the
 * standalone support Telegram bot.
 *
 * Runs on the managed AI gateway (Responses API) with tools, so the assistant
 * can read every part of the student's own account on demand and perform the
 * actions the student asks for (watch a group, toggle auto registration, run a
 * sync, open a ticket). The old free OpenRouter chain is kept as a fallback
 * only, for the case where the gateway is unavailable.
 */
import { stepCountIs, streamText } from "ai";

import { getSupportConfig } from "@/server/admin/settings.server";
import { gatewayApiKey, createGatewayProvider } from "@/lib/ai-gateway.server";
import { buildAccountSummary } from "./data.server";
import { buildSupportTools } from "./tools.server";
import { PROJECT_KNOWLEDGE } from "./knowledge";
import { extractTicket } from "./tickets.server";
import { sanitizeReply } from "./format";

const MODEL = "openai/gpt-6-astra";

const SYSTEM = `أنت "AI Assistant & Support" — مساعد موقع DULMS Notify اللي بيعرض بيانات بوابة جامعة دلتا (DULMS) وبيبعت إشعاراتها.

الأسلوب:
- رُدّ بالعربية المصرية البسيطة. لو رسالة الطالب بالإنجليزية، رُدّ بالإنجليزية بالكامل.
- رد قصير ومباشر زي رسالة واتساب: جملة أو جملتين للأسئلة العادية، وبحد أقصى ١٥ سطر.
- نقاط "- " فقط لو في أكتر من عنصر، وبحد أقصى ٥ عناصر ثم اذكر عدد الباقي.
- من غير عناوين ولا نجوم ولا جداول ولا إيموجي ولا مقدمات زي "طبعًا"، ومن غير تكرار السؤال، ومن غير أي تفكير مكتوب قبل الإجابة.
- لو الطالب طلب كل التفاصيل أو تحليل شامل، اعرض البيانات كاملة ومنظمة من غير حد.

الأدوات:
- عندك أدوات توصلك لكل بيانات الطالب. استخدمها فورًا لأي سؤال عن بيانات بدل ما تخمّن أو تقول مش عندي معلومة. ملخص الحساب اللي جاي في الرسالة الجاية مجرد نظرة سريعة، والتفاصيل من الأدوات.
- تقدر تنفّذ إجراءات: تفعيل متابعة جروب مع تسجيل تلقائي، إيقاف متابعة، تشغيل/إيقاف التسجيل التلقائي، مزامنة فورية، فتح تذكرة دعم.
- لو الطالب طلب إجراء بوضوح (مثلاً «راقب جروب C في GEN403 وسجّلني أول ما يفتح») نفّذه على طول بالأداة المناسبة وبلّغه بالنتيجة الحقيقية اللي رجعت.
- لو الطلب مش واضح (المادة أو الجروب مش محدد) اسأل سؤال واحد قصير قبل التنفيذ.
- بعد أي إجراء، اذكر النتيجة الفعلية من الأداة بالظبط. ممنوع تدّعي إنك عملت حاجة من غير ما تستدعي الأداة.

المحتوى:
- اللقطة مصنفة حسب مصدر DULMS: Grades book = أعمال السنة، Course history = تاريخ المقررات، Transcript = كشف المقررات. ممنوع دمجهم أو تسميتهم Final result.
- لا تنسب بيانات لترم أو سنة إلا لو اسم الترم ظاهر صراحةً؛ غير كده قل "الفصل غير محدد في البيانات".
- في الغياب: Lectures absence للسجلات، Lecture attendance للحضور، Absence warnings للإنذارات، ولا تستنتج إنذارًا من عدد الغيابات.
- لو المعلومة مش موجودة بعد ما تدور بالأدوات، قُل كده صراحةً في جملة واحدة واقترح خطوة.
- لا تخترع أرقامًا أو مواعيد. لا تعرض ولا تطلب كلمة مرور أو توكن أبدًا. لا تتكلم عن لوحة الإدارة أو بيانات أي طالب تاني.
- ممنوع تكتب أي وسم تقني زي [[TICKET: ...]] في أي رد.`;

const FALLBACK_NOTICE = `
تنبيه مهم: الأدوات التنفيذية غير متاحة في هذا الرد الاحتياطي. لا تدّعي تنفيذ متابعة أو مزامنة أو تسجيل أو فتح تذكرة. إذا طلب المستخدم إجراءً، قل بوضوح إن التنفيذ متوقف مؤقتًا واطلب منه المحاولة لاحقًا.`;

export type Turn = { role: "user" | "assistant"; content: string };

export type SupportAnswer =
  { ok: true; reply: string; model: string } | { ok: false; error: string };

/** Answers one question for a signed-in student and stores the exchange. */
export async function answerSupport(options: {
  userId: string | null;
  question: string;
  history: Turn[];
  channel: "web" | "telegram";
  chatId?: string | null;
}): Promise<SupportAnswer> {
  const { userId, question, history, channel, chatId = null } = options;

  const config = await getSupportConfig();
  const channelOn = channel === "web" ? config.webEnabled : config.telegramEnabled;
  if (!config.enabled || !channelOn) return { ok: false, error: config.offlineMessage };

  // One choke point for both entry points: web widget and Telegram bot.
  const { chatQuota, resolveIdentity, throttledChatMessage } = await import("./quota.server");
  const identity = await resolveIdentity({ userId, chatId });
  const quota = await chatQuota(identity);
  if (!quota.allowed) return { ok: false, error: throttledChatMessage(quota) };

  const accountId = identity.userId ?? userId;
  const summary =
    accountId && config.accountAccess
      ? await buildAccountSummary(accountId)
      : "لا يوجد حساب مربوط لهذه المحادثة، أجب عن الأسئلة العامة فقط واطلب من المستخدم ربط حسابه.";

  const system = [
    SYSTEM,
    PROJECT_KNOWLEDGE,
    config.knowledge.trim() ? `معلومات إضافية من فريق الموقع:\n${config.knowledge.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const instructions = `${system}\n\nملخص سريع لحساب الطالب:\n${summary}`;
  const turns = Math.max(2, Math.min(40, config.historyTurns || 12));
  const messages: Message[] = [
    ...history.slice(-turns).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: question },
  ];

  const result = await runGateway({
    instructions,
    messages,
    userId: config.accountAccess ? accountId : null,
    channel,
    chatId,
    ticketsEnabled: config.ticketsEnabled,
  });

  const answer = result.ok
    ? result
    : await runFallback({ instructions, messages, config, userId: accountId });

  if (!answer.ok) return answer;

  // Tickets come from the dedicated tool/form, so a stray tag in a normal
  // answer is stripped and never turns into a row.
  const { text: raw } = extractTicket(answer.reply);
  // Reasoning models sometimes prepend their scratchpad; never show it.
  const text = sanitizeReply(raw);
  if (!text) return { ok: false, error: "معرفتش أجيب رد دلوقتي، جرّب تاني بعد ثانية." };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("support_messages").insert([
    { user_id: accountId, channel, chat_id: chatId, role: "user", content: question },
    { user_id: accountId, channel, chat_id: chatId, role: "assistant", content: text },
  ]);
  if (error) console.error("[support] failed to persist exchange", error.message);

  return { ok: true, reply: text, model: answer.model };
}

type Message = { role: "user" | "assistant"; content: string };

/** Primary path: managed AI gateway with the full tool set. */
async function runGateway(options: {
  instructions: string;
  messages: Message[];
  userId: string | null;
  channel: "web" | "telegram";
  chatId: string | null;
  ticketsEnabled: boolean;
}): Promise<SupportAnswer> {
  const key = gatewayApiKey();
  if (!key) return { ok: false, error: "LOVABLE_API_KEY غير مضبوط" };

  try {
    const gateway = createGatewayProvider(key);
    const stream = streamText({
      model: gateway.responses(MODEL),
      system: options.instructions,
      messages: options.messages,
      tools: buildSupportTools({
        userId: options.userId,
        channel: options.channel,
        chatId: options.chatId,
        ticketsEnabled: options.ticketsEnabled,
      }),
      stopWhen: stepCountIs(12),
      providerOptions: {
        openai: {
          forceReasoning: true,
          // Support answers must be quick; the model still reasons, lightly.
          reasoningEffort: "low",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
      onError: ({ error }) => console.error("[support] gateway stream error", error),
    });
    const reply = (await stream.text).trim();
    if (!reply) return { ok: false, error: "رد فارغ من النموذج" };
    return { ok: true, reply, model: MODEL };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    console.error("[support] gateway failed", error);
    return { ok: false, error };
  }
}

/** Fallback only: the old free OpenRouter chain, without tools. */
async function runFallback(options: {
  instructions: string;
  messages: Message[];
  config: { model: string; temperature: number; maxTokens: number };
  userId: string | null;
}): Promise<SupportAnswer> {
  const { chatComplete } = await import("./openrouter.server");

  // Without tools the model needs the wide snapshot inline again.
  const preamble: { role: "system"; content: string }[] = [
    { role: "system", content: `${options.instructions}\n${FALLBACK_NOTICE}` },
  ];
  if (options.userId) {
    try {
      const { buildAccountContext } = await import("./context.server");
      const context = await buildAccountContext(options.userId);
      preamble.push({ role: "system", content: `لقطة حساب الطالب الحالية:\n${context}` });
    } catch (cause) {
      console.error("[support] fallback context failed", cause);
    }
  }
  const messages = [...preamble, ...options.messages];

  const result = await chatComplete(messages, {
    model: options.config.model,
    temperature: options.config.temperature,
    maxTokens: options.config.maxTokens,
  });
  return result.ok
    ? { ok: true, reply: result.reply, model: result.model }
    : { ok: false, error: result.error };
}

/** Recent turns for a Telegram chat, so the bot keeps conversation memory. */
export async function recentTurnsForChat(chatId: string, limit = 12): Promise<Turn[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("support_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .reverse()
    .filter(
      (row): row is { role: "user" | "assistant"; content: string } =>
        row.role === "user" || row.role === "assistant",
    );
}
