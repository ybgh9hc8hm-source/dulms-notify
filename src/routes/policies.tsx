import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Database, LockKeyhole, Scale, ShieldCheck } from "lucide-react";

import { BrandLock } from "@/components/brand/DeltaMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { POLICY_VERSION } from "@/lib/policy";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "Usage & Privacy Policy — DULMS Notify" },
      { name: "description", content: "DULMS Notify usage terms, privacy practices, automation limits, and student responsibilities." },
      { property: "og:title", content: "Usage & Privacy Policy — DULMS Notify" },
      { property: "og:description", content: "How DULMS Notify handles student data, notifications, automation, and account access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PoliciesPage,
});

const COPY = {
  en: {
    title: "Usage & Privacy Policy",
    intro: "Please read these terms before using DULMS Notify. Signing in means you understand and accept this policy.",
    updated: `Policy version ${POLICY_VERSION}`,
    sections: [
      ["Service scope", "DULMS Notify is an independent student project. It organises information available in your own DULMS account, periodically checks for changes, sends optional Telegram alerts, and may provide AI assistance and registration automation. It is not affiliated with or endorsed by Delta University."],
      ["Account data", "You provide your DULMS student ID and password so the service can verify access and read your pages. The password is encrypted at rest. Access is limited to operating the requested service, synchronisation, notifications, support, and security."],
      ["Information we process", "The service may process academic profile details, courses, schedules, grades, attendance, assignments, announcements, registration information, Telegram identifiers, service logs, and preferences. Data is retained only while needed to provide, protect, and maintain the service."],
      ["Telegram and AI", "Telegram linking is optional. Messages sent through Telegram are also subject to Telegram's terms. AI answers may be incomplete or inaccurate and must not replace official university records or academic advice."],
      ["Automation", "Automated registration and monitoring are assistance tools, not guarantees. Availability, university systems, CAPTCHA, connectivity, and rule changes may prevent or delay an action. You must confirm important registrations and deadlines through official DULMS pages."],
      ["Your responsibilities", "Use only your own account, keep your credentials private, review notifications and registrations, and follow university rules. Do not misuse the service, overload systems, bypass restrictions, or attempt unauthorised access."],
      ["Availability and suspension", "The service may be delayed, limited, changed, or suspended for maintenance, security, capacity, university-system changes, suspected misuse, or legal requirements. Access may be revoked to protect users or the service."],
      ["Liability and choices", "The service is provided as available without a guarantee of uninterrupted delivery or error-free data. Official DULMS pages remain the authoritative source. You may stop using the service and request account-data deletion through the contact channels below."],
      ["Contact", "For privacy, support, or deletion requests, contact Eng. HASSAN MOHAMED through the official links shown on the home page or WhatsApp: +20 102 171 4351 / +966 50 051 0367."],
    ],
    back: "Back to sign in",
  },
  ar: {
    title: "سياسة الاستخدام والخصوصية",
    intro: "يرجى قراءة هذه البنود قبل استخدام دالمز نوتيفاي. تسجيل الدخول يعني فهمك لهذه السياسة وموافقتك عليها.",
    updated: `إصدار السياسة ${POLICY_VERSION}`,
    sections: [
      ["نطاق الخدمة", "دالمز نوتيفاي مشروع طلابي مستقل ينظم المعلومات المتاحة داخل حسابك على DULMS، ويفحص التغييرات دوريًا، ويرسل تنبيهات تليجرام اختيارية، وقد يوفر مساعدًا ذكيًا وأدوات لمتابعة تسجيل المواد. المشروع غير تابع لجامعة الدلتا ولا يمثلها رسميًا."],
      ["بيانات الحساب", "تقدم كود الطالب وكلمة مرور DULMS للتحقق من صلاحية الدخول وقراءة صفحاتك. تُحفظ كلمة المرور مشفرة، ويقتصر استخدامها على تشغيل الخدمة المطلوبة والمزامنة والتنبيهات والدعم والحماية."],
      ["المعلومات التي نعالجها", "قد تعالج الخدمة بيانات الملف الأكاديمي والمواد والجداول والدرجات والحضور والتكاليف والإعلانات والتسجيل، ومعرّف تليجرام، وسجلات التشغيل والتفضيلات. نحتفظ بها بالقدر اللازم لتقديم الخدمة وحمايتها وصيانتها."],
      ["تليجرام والذكاء الاصطناعي", "ربط تليجرام اختياري، والرسائل المرسلة من خلاله تخضع أيضًا لشروط تليجرام. قد تكون إجابات الذكاء الاصطناعي ناقصة أو غير دقيقة، ولا تستبدل السجلات الرسمية أو الإرشاد الأكاديمي."],
      ["الأتمتة", "التسجيل الآلي والمراقبة أدوات مساعدة وليسا ضمانًا. قد يمنع توفر الأماكن أو نظام الجامعة أو CAPTCHA أو الاتصال أو تغير القواعد تنفيذ الإجراء أو يؤخره. يجب مراجعة التسجيلات والمواعيد المهمة من صفحات DULMS الرسمية."],
      ["مسؤولياتك", "استخدم حسابك الشخصي فقط، وحافظ على سرية بياناتك، وراجع التنبيهات والتسجيلات، والتزم بقواعد الجامعة. يُمنع إساءة الاستخدام أو الضغط المتعمد على الأنظمة أو تجاوز القيود أو محاولة الوصول غير المصرح به."],
      ["الإتاحة والإيقاف", "قد تتأخر الخدمة أو تُقيّد أو تتغير أو تتوقف بسبب الصيانة أو الحماية أو السعة أو تغييرات نظام الجامعة أو الاشتباه في إساءة الاستخدام أو المتطلبات القانونية. وقد يُوقف الوصول لحماية المستخدمين أو الخدمة."],
      ["حدود المسؤولية وخياراتك", "تقدم الخدمة حسب الإتاحة دون ضمان الاستمرار أو خلو البيانات من الأخطاء. تظل صفحات DULMS الرسمية هي المصدر المعتمد. يمكنك التوقف عن الاستخدام وطلب حذف بيانات حسابك عبر وسائل التواصل أدناه."],
      ["التواصل", "لطلبات الخصوصية أو الدعم أو حذف البيانات، تواصل مع Eng. HASSAN MOHAMED عبر الروابط الرسمية في الصفحة الرئيسية أو واتساب: ‎+20 102 171 4351 / ‎+966 50 051 0367."],
    ],
    back: "العودة لتسجيل الدخول",
  },
} as const;

const ICONS = [ShieldCheck, LockKeyhole, Database, ShieldCheck, Scale, ShieldCheck, LockKeyhole, Scale, Database];

function PoliciesPage() {
  const { lang, dir } = useI18n();
  const copy = COPY[lang];
  const Arrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen">
      <header className="material-regular sticky top-0 z-30 border-b-[0.5px] border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5">
          <Link to="/" aria-label="DULMS Notify"><BrandLock /></Link>
          <LanguageToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-footnote font-medium text-primary">{copy.updated}</p>
          <h1 className="text-large-title mt-3">{copy.title}</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{copy.intro}</p>
        </div>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {copy.sections.map(([title, body], index) => {
            const Icon = ICONS[index] ?? ShieldCheck;
            return (
              <section key={title} className="grid gap-3 py-7 sm:grid-cols-[2rem_1fr]">
                <Icon className="mt-1 size-5 text-primary" aria-hidden="true" />
                <div><h2 className="text-title-3">{title}</h2><p className="mt-2 leading-7 text-muted-foreground">{body}</p></div>
              </section>
            );
          })}
        </div>
        <Button asChild variant="outline" className="mt-10">
          <Link to="/auth"><Arrow className="size-4" />{copy.back}</Link>
        </Button>
      </main>
    </div>
  );
}