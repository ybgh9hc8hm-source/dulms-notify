import { useEffect, useMemo } from "react";
import { AlertTriangle, Check, Info, Loader2, XCircle } from "lucide-react";
import { Toaster as Sonner } from "sonner";

import { cn } from "@/lib/utils";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * DULMS toast identity — architectural brass aesthetic.
 *
 * Each toast is a compact slate card with a strong colored right-edge accent
 * (sage for success, brass for info/warning, red for error) and a tinted
 * icon tile. Colors are driven from the design system tokens so they stay
 * consistent across the dark dashboard.
 */

const baseToast =
  "group toast pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-white/5 bg-card p-4 shadow-2xl ring-1 ring-white/5 backdrop-blur-sm";

const iconTile = "flex size-10 shrink-0 items-center justify-center rounded-lg";

function ToastIcon({ type }: { type: keyof typeof icons }) {
  switch (type) {
    case "success":
      return <Check className="size-5" />;
    case "error":
      return <XCircle className="size-5" />;
    case "warning":
      return <AlertTriangle className="size-5" />;
    case "loading":
      return <Loader2 className="size-5 animate-spin" />;
    case "info":
    default:
      return <Info className="size-5" />;
  }
}

const icons = {
  success: (
    <div className={cn(iconTile, "bg-primary/10 text-primary")}>
      <ToastIcon type="success" />
    </div>
  ),
  error: (
    <div className={cn(iconTile, "bg-destructive/10 text-destructive")}>
      <ToastIcon type="error" />
    </div>
  ),
  warning: (
    <div className={cn(iconTile, "bg-accent/10 text-accent")}>
      <ToastIcon type="warning" />
    </div>
  ),
  info: (
    <div className={cn(iconTile, "bg-accent/10 text-accent")}>
      <ToastIcon type="info" />
    </div>
  ),
  loading: (
    <div className={cn(iconTile, "bg-accent/10 text-accent")}>
      <ToastIcon type="loading" />
    </div>
  ),
};

function Toaster({ ...props }: ToasterProps) {
  // Sonner applies its own default styles for [data-styled="true"]. We
  // override the background/text so the toast follows the DULMS design
  // system while keeping the library's positioning and animations.
  useEffect(() => {
    if (document.getElementById("dulms-toast-override")) return;
    const style = document.createElement("style");
    style.id = "dulms-toast-override";
    style.textContent = `
      [data-sonner-toast][data-styled="true"] {
        background: var(--color-card) !important;
        color: var(--color-card-foreground) !important;
        border: 1px solid var(--color-border) !important;
        text-align: start;
      }
      [data-sonner-toast][data-styled="true"] [data-content] {
        align-items: flex-start;
        text-align: start;
      }
      [data-sonner-toast][data-type="success"] {
        border-inline-start: 4px solid var(--color-primary) !important;
      }
      [data-sonner-toast][data-type="success"] [data-title] {
        color: var(--color-primary) !important;
      }
      [data-sonner-toast][data-type="error"] {
        border-inline-start: 4px solid var(--color-destructive) !important;
      }
      [data-sonner-toast][data-type="error"] [data-title] {
        color: var(--color-destructive) !important;
      }
      [data-sonner-toast][data-type="warning"],
      [data-sonner-toast][data-type="info"] {
        border-inline-start: 4px solid var(--color-accent) !important;
      }
      [data-sonner-toast][data-type="warning"] [data-title],
      [data-sonner-toast][data-type="info"] [data-title] {
        color: var(--color-accent) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  const iconOverrides = useMemo(() => icons, []);

  return (
    <Sonner
      className="toaster group"
      position="top-center"
      gap={10}
      duration={4500}
      icons={iconOverrides}
      closeButton
      toastOptions={{
        classNames: {
          toast: cn(baseToast),
          title: "text-sm font-bold leading-tight",
          description: "mt-0.5 text-xs leading-relaxed text-muted-foreground",
          icon: "mt-0 shrink-0",
          actionButton:
            "rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90",
          cancelButton:
            "rounded-lg border border-primary/30 bg-transparent px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10",
          closeButton:
            "absolute end-3 top-3 border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
