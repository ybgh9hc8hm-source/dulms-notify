import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Cloud, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { loginWithDulms } from "@/lib/dulms-auth.functions";
import { BrandLock, DeltaMark } from "@/components/brand/DeltaMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/lib/i18n";
import { clearSessionMirror, ensureSessionPersistence } from "@/lib/session-persist";
import { POLICY_VERSION } from "@/lib/policy";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in with DULMS — DULMS Notify" },
      {
        name: "description",
        content:
          "Sign in with your DULMS student ID and password to track quizzes, assignments and grades.",
      },
      { property: "og:title", content: "Sign in with DULMS — DULMS Notify" },
      {
        property: "og:description",
        content: "No new email or password — your DULMS student ID and password only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const login = useServerFn(loginWithDulms);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [dulmsId, setDulmsId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [humanCheck, setHumanCheck] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSessionPersistence();
      // Never redirect blindly on an existing session: on a shared device that
      // silently drops the student into someone else's account. Show who is
      // signed in and let them continue or sign in as themselves.
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user;
      if (user) {
        const id =
          (user.user_metadata?.["dulms_id"] as string | undefined) ??
          user.email?.split("@")[0] ??
          null;
        setCurrentId(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Sign-in feedback as a structured card, not a raw one-liner:
   * access denials (restricted / locked / full) get the brass warning style
   * with a calm title and the reason underneath; technical failures get the
   * red error style. Denials stay longer so the contact hint is readable.
   */
  function showSignInError(code: string | undefined, message: string) {
    if (code === "restricted" || code === "full") {
      toast.warning(t("auth.restrictedTitle"), { description: message, duration: 9000 });
      return;
    }
    if (code === "locked") {
      toast.warning(t("auth.lockedTitle"), { description: message, duration: 9000 });
      return;
    }
    toast.error(t("auth.errorTitle"), { description: message });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      // Keep an existing session alive until DULMS accepts the replacement
      // credentials. A failed university login must never sign the student out.
      const result = await login({
        data: { dulmsId, password, policyAccepted, policyVersion: POLICY_VERSION, humanCheck },
      });
      if (!result.ok) {
        showSignInError(result.code, result.message);
        return;
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      clearSessionMirror();
      const { data: signedIn, error } = await supabase.auth.signInWithPassword({
        email: result.email,
        password: result.password,
      });
      if (error) throw error;
      if (signedIn.user?.id !== result.userId) {
        await supabase.auth.signOut();
        clearSessionMirror();
        toast.error(t("auth.genericError"));
        return;
      }
      toast.success(t("auth.success"), {
        description: t("auth.successSub"),
        duration: 3500,
      });
      await navigate({ to: "/dashboard", replace: true });
    } catch (cause) {
      console.error("DULMS sign-in failed", cause);
      const message =
        cause instanceof Error && cause.message ? cause.message : t("auth.genericError");
      toast.error(t("auth.errorTitle"), { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <BrandLock size="lg" />
          </Link>
          <LanguageToggle />
        </div>

        <div className="card-elevated p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <DeltaMark className="size-10 shrink-0 rounded-xl ring-1 ring-primary/25" />
            <h1 className="text-title-1">{t("auth.title")}</h1>
          </div>
          <p className="text-subhead mt-1.5">{t("auth.sub")}</p>

          {currentId && (
            <div className="mt-5 rounded-xl border-[0.5px] border-border bg-secondary/40 p-3.5 text-sm">
              <p className="text-muted-foreground">
                {t("auth.signedInAs")}{" "}
                <span className="font-semibold text-foreground" dir="ltr">
                  {currentId}
                </span>
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void navigate({ to: "/dashboard", replace: true })}
                >
                  {t("auth.continueAs")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await queryClient.cancelQueries();
                    queryClient.clear();
                    await supabase.auth.signOut();
                    clearSessionMirror();
                    setCurrentId(null);
                  }}
                >
                  {t("auth.useAnother")}
                </Button>
              </div>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            method="post"
            action="#"
            name="dulms-login"
            className="mt-6 space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="dulmsId">{t("auth.id")}</Label>
              <Input
                id="dulmsId"
                name="username"
                required
                dir="ltr"
                type="text"
                inputMode="numeric"
                value={dulmsId}
                onChange={(e) => setDulmsId(e.target.value)}
                placeholder={t("auth.idPlaceholder")}
                maxLength={50}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={200}
                  autoComplete="current-password"
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("auth.hidePass") : t("auth.showPass")}
                  className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/25 p-3.5">
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-6">
                <Checkbox
                  checked={policyAccepted}
                  onCheckedChange={(value) => setPolicyAccepted(value === true)}
                  aria-label={t("auth.policyAccept")}
                  className="mt-1"
                />
                <span>
                  {t("auth.policyAccept")} {" "}
                  <Link to="/policies" target="_blank" className="font-semibold text-primary underline underline-offset-4">
                    {t("auth.policyLink")}
                  </Link>
                </span>
              </label>
            </div>

            <button
              type="button"
              className="flex min-h-16 w-full items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-start shadow-sm transition-colors hover:bg-secondary/30"
              onClick={() => setHumanCheck((value) => !value)}
              aria-pressed={humanCheck}
            >
              <span className="flex items-center gap-3">
                <span className={`grid size-7 place-items-center rounded-sm border-2 ${humanCheck ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60"}`}>
                  {humanCheck ? <Check className="size-5" /> : null}
                </span>
                <span className="text-sm font-medium">{t("auth.notRobot")}</span>
              </span>
              <span className="flex flex-col items-center text-[10px] leading-tight text-muted-foreground">
                <Cloud className="mb-1 size-6 text-primary" />
                Cloudflare
                <span>{t("auth.demoCheck")}</span>
              </span>
            </button>
            <Button
              type="submit"
              size="lg"
              className="mt-6 w-full"
              disabled={loading || dulmsId.trim().length < 3 || password.length < 3 || !policyAccepted || !humanCheck}
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? t("auth.submitting") : t("auth.submit")}
            </Button>
          </form>

          <p className="text-footnote mt-6 flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            {t("auth.privacy")}
          </p>
        </div>
      </div>
    </main>
  );
}
