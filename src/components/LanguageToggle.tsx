import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle({ size = "sm" }: { size?: "sm" | "icon" | "default" }) {
  const { lang, setLang, t } = useI18n();
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      aria-label="Toggle language"
      className="relative z-10 min-w-0 gap-1.5 px-2 sm:px-3"
    >
      <Languages className="size-4" />
      <span className="max-w-16 truncate text-xs font-semibold sm:max-w-none">
        {t("common.language")}
      </span>
    </Button>
  );
}
