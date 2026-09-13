/**
 * Single source of truth for every editable piece of the landing page.
 *
 * Both the public landing route and the admin "الصفحة الرئيسية" panel import
 * this file, so a field added here shows up in the editor and on the page.
 */

export type LandingText = { en: Record<string, string>; ar: Record<string, string> };

export type LandingConfig = {
  /** Absolute URL of the hero screenshot. Empty = bundled default image. */
  heroImage: string;
  /** Section-level visibility switches. */
  showBadge: boolean;
  showHero: boolean;
  showHeroImage: boolean;
  showCtaNote: boolean;
  showStats: boolean;
  showCover: boolean;
  showFeatures: boolean;
  showChips: boolean;
  showSteps: boolean;
  showFinal: boolean;
  showFooter: boolean;
  showSignIn: boolean;
  showLanguage: boolean;
  /** Ids hidden individually (feat1…feat8, stat1…stat4, step1…step3). */
  hiddenFeatures: string[];
  hiddenStats: string[];
  hiddenSteps: string[];
  /** Per-language copy overrides, keyed by dictionary key. */
  text: LandingText;
};

export const LANDING_DEFAULT: LandingConfig = {
  heroImage: "",
  showBadge: true,
  showHero: true,
  showHeroImage: true,
  showCtaNote: true,
  showStats: true,
  showCover: true,
  showFeatures: true,
  showChips: true,
  showSteps: true,
  showFinal: true,
  showFooter: true,
  showSignIn: true,
  showLanguage: true,
  hiddenFeatures: [],
  hiddenStats: [],
  hiddenSteps: [],
  text: { en: {}, ar: {} },
};

export type FieldGroup = {
  id: string;
  title: string;
  keys: { key: string; label: string; long?: boolean }[];
};

/** Every text node rendered by the landing page, grouped as the page reads. */
export const LANDING_GROUPS: FieldGroup[] = [
  {
    id: "top",
    title: "الشريط العلوي والبطاقة",
    keys: [
      { key: "common.signIn", label: "زر الدخول (أعلى الصفحة)" },
      { key: "landing.badge", label: "الشارة فوق العنوان" },
    ],
  },
  {
    id: "hero",
    title: "العنوان الرئيسي",
    keys: [
      { key: "landing.headline.pre", label: "العنوان — الجزء الأول" },
      { key: "landing.headline.hi", label: "العنوان — الكلمة المميزة" },
      { key: "landing.headline.post", label: "العنوان — الجزء الأخير" },
      { key: "landing.lead", label: "النص التعريفي", long: true },
      { key: "landing.cta", label: "زر الدعوة للتسجيل" },
      { key: "landing.feat4.title", label: "ملاحظة الأمان بجانب الزر" },
      { key: "landing.howTitle", label: "الوصف البديل لصورة الهيرو" },
    ],
  },
  {
    id: "stats",
    title: "شريط الأرقام",
    keys: [
      { key: "landing.stat1v", label: "الرقم ١" },
      { key: "landing.stat1", label: "وصف الرقم ١" },
      { key: "landing.stat2v", label: "الرقم ٢" },
      { key: "landing.stat2", label: "وصف الرقم ٢" },
      { key: "landing.stat3v", label: "الرقم ٣" },
      { key: "landing.stat3", label: "وصف الرقم ٣" },
      { key: "landing.stat4v", label: "الرقم ٤" },
      { key: "landing.stat4", label: "وصف الرقم ٤" },
    ],
  },
  {
    id: "cover",
    title: "قسم التغطية",
    keys: [
      { key: "landing.coverTitle", label: "عنوان القسم" },
      { key: "landing.coverSub", label: "وصف القسم", long: true },
    ],
  },
  {
    id: "features",
    title: "المميزات (٨ عناصر)",
    keys: Array.from({ length: 8 }, (_, i) => i + 1).flatMap((n) => [
      { key: `landing.feat${n}.title`, label: `ميزة ${n} — العنوان` },
      { key: `landing.feat${n}.body`, label: `ميزة ${n} — الوصف`, long: true },
    ]),
  },
  {
    id: "steps",
    title: "خطوات التشغيل (٣ خطوات)",
    keys: [1, 2, 3].flatMap((n) => [
      { key: `landing.step${n}.title`, label: `خطوة ${n} — العنوان` },
      { key: `landing.step${n}.body`, label: `خطوة ${n} — الوصف`, long: true },
    ]),
  },
  {
    id: "final",
    title: "قسم الخاتمة والتذييل",
    keys: [
      { key: "landing.finalTitle", label: "عنوان الخاتمة" },
      { key: "landing.finalSub", label: "وصف الخاتمة", long: true },
      { key: "landing.footer", label: "نص التذييل" },
    ],
  },
];

export const LANDING_KEYS = LANDING_GROUPS.flatMap((g) => g.keys.map((k) => k.key));

export const FEATURE_IDS = Array.from({ length: 8 }, (_, i) => `feat${i + 1}`);
export const STAT_IDS = [1, 2, 3, 4].map((n) => `stat${n}`);
export const STEP_IDS = [1, 2, 3].map((n) => `step${n}`);
