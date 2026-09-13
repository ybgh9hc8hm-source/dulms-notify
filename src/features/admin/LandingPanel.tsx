/**
 * Admin editor for the public landing page: hero image, every text node,
 * every section switch, and per-item visibility — in both languages.
 */
import { useRef, useState } from "react";
import { ExternalLink, Eye, Loader2, RotateCcw, Save, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DICT } from "@/lib/i18n-dictionary";
import {
  FEATURE_IDS,
  LANDING_DEFAULT,
  LANDING_GROUPS,
  STAT_IDS,
  STEP_IDS,
  type LandingConfig,
} from "@/features/landing/fields";

type Lang = "ar" | "en";

const SECTION_SWITCHES: { id: keyof LandingConfig; label: string; hint: string }[] = [
  { id: "showLanguage", label: "زر تغيير اللغة", hint: "أعلى الصفحة" },
  { id: "showSignIn", label: "زر الدخول بالأعلى", hint: "الشريط العلوي" },
  { id: "showBadge", label: "شارة أعلى العنوان", hint: "«لطلاب جامعة الدلتا»" },
  { id: "showHero", label: "قسم الهيرو", hint: "العنوان والوصف والزر" },
  { id: "showHeroImage", label: "صورة الهيرو", hint: "لقطة المنتج" },
  { id: "showCtaNote", label: "ملاحظة الأمان", hint: "بجانب زر التسجيل" },
  { id: "showStats", label: "شريط الأرقام", hint: "٤ أرقام" },
  { id: "showCover", label: "قسم التغطية", hint: "العنوان والوصف" },
  { id: "showFeatures", label: "شبكة المميزات", hint: "٨ عناصر" },
  { id: "showChips", label: "وسوم الأقسام", hint: "دوائر أقسام دالمز" },
  { id: "showSteps", label: "خطوات التشغيل", hint: "٣ خطوات" },
  { id: "showFinal", label: "قسم الخاتمة", hint: "الدعوة الأخيرة" },
  { id: "showFooter", label: "التذييل", hint: "أسفل الصفحة" },
];

function ItemToggles({
  title,
  ids,
  labelFor,
  hidden,
  onToggle,
}: {
  title: string;
  ids: string[];
  labelFor: (id: string) => string;
  hidden: string[];
  onToggle: (id: string, visible: boolean) => void;
}) {
  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {ids.map((id) => (
          <label
            key={id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span className="min-w-0 truncate text-xs">{labelFor(id)}</span>
            <Switch
              checked={!hidden.includes(id)}
              onCheckedChange={(value) => onToggle(id, value)}
            />
          </label>
        ))}
      </div>
    </Card>
  );
}

export function LandingPanel({
  config,
  busy,
  onSave,
  onUploadHero,
}: {
  config: LandingConfig;
  busy: boolean;
  onSave: (next: LandingConfig) => void;
  /** Uploads the picked file and resolves with its served URL (or null). */
  onUploadHero: (dataUrl: string) => Promise<string | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pickFile = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const url = await onUploadHero(dataUrl);
      if (url) setDraft((current) => ({ ...current, heroImage: url }));
    } finally {
      setUploading(false);
    }
  };

  const [draft, setDraft] = useState<LandingConfig>({
    ...LANDING_DEFAULT,
    ...config,
    text: {
      ar: { ...(config.text?.ar ?? {}) },
      en: { ...(config.text?.en ?? {}) },
    },
  });
  const [lang, setLang] = useState<Lang>("ar");

  const fallback = (key: string) => DICT[key]?.[lang] ?? "";
  const value = (key: string) => draft.text[lang][key] ?? "";

  const setText = (key: string, next: string) =>
    setDraft((current) => ({
      ...current,
      text: { ...current.text, [lang]: { ...current.text[lang], [key]: next } },
    }));

  const resetText = (key: string) =>
    setDraft((current) => {
      const nextLang = { ...current.text[lang] };
      delete nextLang[key];
      return { ...current, text: { ...current.text, [lang]: nextLang } };
    });

  const toggleItem =
    (field: "hiddenFeatures" | "hiddenStats" | "hiddenSteps") => (id: string, visible: boolean) =>
      setDraft((current) => ({
        ...current,
        [field]: visible
          ? current[field].filter((entry) => entry !== id)
          : [...new Set([...current[field], id])],
      }));

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">محتوى الصفحة الرئيسية</h2>
            <p className="text-xs text-muted-foreground">
              كل نص وكل عنصر وكل صورة في صفحة الهبوط قابل للتعديل من هنا، لكل لغة على حدة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-border">
              {(["ar", "en"] as Lang[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    lang === code ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {code === "ar" ? "العربية" : "English"}
                </button>
              ))}
            </div>
            <Button asChild variant="outline" size="sm">
              <a href="/" target="_blank" rel="noreferrer">
                <Eye className="size-4" /> معاينة
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="landing-hero">صورة الهيرو (ارفع صورة من ملفاتك)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="landing-hero"
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void pickFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading || busy}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              رفع صورة جديدة
            </Button>
            {draft.heroImage ? (
              <Button
                type="button"
                variant="ghost"
                disabled={uploading || busy}
                onClick={() => setDraft((current) => ({ ...current, heroImage: "" }))}
              >
                <RotateCcw className="size-4" /> الصورة الأصلية
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            PNG أو JPG أو WEBP حتى ٦ ميجابايت. لا تنسَ الحفظ بعد الرفع.
          </p>
          {draft.heroImage ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <img src={draft.heroImage} alt="معاينة صورة الهيرو" className="w-full" />
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">إظهار/إخفاء أقسام الصفحة</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTION_SWITCHES.map((item) => (
            <label
              key={String(item.id)}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{item.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.hint}
                </span>
              </span>
              <Switch
                checked={Boolean(draft[item.id])}
                onCheckedChange={(next) => setDraft((current) => ({ ...current, [item.id]: next }))}
              />
            </label>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <ItemToggles
          title="عناصر المميزات"
          ids={FEATURE_IDS}
          labelFor={(id) =>
            draft.text[lang][`landing.${id}.title`] ?? fallback(`landing.${id}.title`)
          }
          hidden={draft.hiddenFeatures}
          onToggle={toggleItem("hiddenFeatures")}
        />
        <ItemToggles
          title="عناصر الأرقام"
          ids={STAT_IDS}
          labelFor={(id) => draft.text[lang][`landing.${id}`] ?? fallback(`landing.${id}`)}
          hidden={draft.hiddenStats}
          onToggle={toggleItem("hiddenStats")}
        />
        <ItemToggles
          title="عناصر الخطوات"
          ids={STEP_IDS}
          labelFor={(id) =>
            draft.text[lang][`landing.${id}.title`] ?? fallback(`landing.${id}.title`)
          }
          hidden={draft.hiddenSteps}
          onToggle={toggleItem("hiddenSteps")}
        />
      </div>

      {LANDING_GROUPS.map((group) => (
        <Card key={group.id} className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.keys.map((field) => (
              <div key={field.key} className={field.long ? "space-y-1 sm:col-span-2" : "space-y-1"}>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`f-${field.key}`} className="text-xs">
                    {field.label}
                  </Label>
                  {value(field.key) ? (
                    <button
                      type="button"
                      onClick={() => resetText(field.key)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="size-3" /> الأصلي
                    </button>
                  ) : null}
                </div>
                {field.long ? (
                  <Textarea
                    id={`f-${field.key}`}
                    rows={3}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                    placeholder={fallback(field.key)}
                    value={value(field.key)}
                    maxLength={600}
                    onChange={(event) => setText(field.key, event.target.value)}
                  />
                ) : (
                  <Input
                    id={`f-${field.key}`}
                    dir={lang === "ar" ? "rtl" : "ltr"}
                    placeholder={fallback(field.key)}
                    value={value(field.key)}
                    maxLength={600}
                    onChange={(event) => setText(field.key, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => onSave(draft)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          حفظ الصفحة الرئيسية
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setDraft({ ...LANDING_DEFAULT, text: { ar: {}, en: {} } })}
        >
          <RotateCcw className="size-4" /> استعادة كل الافتراضيات
        </Button>
      </div>
    </div>
  );
}
