import { useState } from "react";
import { Download, Share, Plus, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstallPWA } from "@/lib/use-install-pwa";
import { useI18n } from "@/lib/i18n";

export function InstallAppButton() {
  const { state, promptInstall } = useInstallPWA();
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);

  if (state === "installed" || state === "unavailable") return null;

  const ar = lang === "ar";
  const label = ar ? "تثبيت التطبيق" : "Install app";

  async function onClick() {
    if (state === "ready") {
      const res = await promptInstall();
      if (res === "accepted") toast.success(ar ? "تم تثبيت التطبيق ✅" : "App installed ✅");
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <Button
        className="shrink-0 px-2 sm:px-3"
        variant="secondary"
        size="sm"
        onClick={onClick}
        aria-label={label}
        title={label}
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">{label}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5" />
              {ar ? "تثبيت DULMS Notify" : "Install DULMS Notify"}
            </DialogTitle>
            <DialogDescription>
              {state === "ios"
                ? ar
                  ? "على iPhone/iPad، التثبيت يتم من متصفح Safari بخطوتين فقط:"
                  : "On iPhone/iPad, install from Safari in two quick steps:"
                : ar
                  ? "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."
                  : 'Open your browser menu and choose "Install app" or "Add to Home Screen".'}
            </DialogDescription>
          </DialogHeader>

          {state === "ios" && (
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Share className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>
                  {ar
                    ? "اضغط زر المشاركة في شريط Safari السفلي."
                    : "Tap the Share button in Safari's bottom bar."}
                </span>
              </li>
              <li className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                <Plus className="mt-0.5 size-5 shrink-0 text-primary" />
                <span>
                  {ar
                    ? "اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen)."
                    : 'Choose "Add to Home Screen".'}
                </span>
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
