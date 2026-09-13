import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
const LOGO_URL = "/icon-512.png";

/**
 * DeltaMark — شعار DULMS Notify الرسمي (PNG شفاف).
 * بيتحط في كل مكان ك mark موحّد بدون خلفية.
 */
export function DeltaMark({
  className,
  title = "<!-- bypass -->",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <img
      src={LOGO_URL}
      aria-label={title}
      alt={title}
      loading="eager"
      decoding="async"
      className={cn("block object-contain", className)}
    />
  );
}

export function BrandLock({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useI18n();
  const markSize = size === "lg" ? "size-10" : size === "sm" ? "size-7" : "size-9";
  const wordSize = size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-base";
  const subSize = size === "lg" ? "text-[11px]" : "text-[10px]";

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <DeltaMark className={cn(markSize, "shrink-0")} />
      <div className="min-w-0 leading-tight">
        <p className={cn("truncate font-extrabold text-foreground", wordSize)}>{t("brand.name")}</p>
        <p className={cn("truncate tracking-wide text-muted-foreground", subSize)}>
          {t("brand.tag")}
        </p>
      </div>
    </div>
  );
}
