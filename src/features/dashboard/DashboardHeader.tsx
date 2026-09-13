/** Sticky dashboard top bar: brand, language, install, sign-out. */
import { LogOut } from "lucide-react";

import { BrandLock } from "@/components/brand/DeltaMark";
import { InstallAppButton } from "@/components/InstallAppButton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n";

interface Props {
  hasAccount: boolean;
  onSignOut: () => void;
}

export function DashboardHeader({ hasAccount, onSignOut }: Props) {
  const { t } = useI18n();

  return (
    <header className="material-regular sticky top-0 z-20 border-b-[0.5px] border-border">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3.5">
        {hasAccount && (
          <SidebarTrigger className="press size-9 shrink-0 rounded-xl bg-secondary/60 text-foreground active:scale-[0.97] hover:bg-secondary [&_svg]:size-[1.05rem]" />
        )}
        <BrandLock size="sm" className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <LanguageToggle />
          <InstallAppButton />
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={onSignOut}
            aria-label={t("common.signOut")}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
