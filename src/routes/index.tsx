import { siteUrl } from "@/config/site";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Layers,
  Lock,
  RefreshCcw,
  BellRing,
  Instagram,
  Linkedin,
  MessageCircle,
  Copyright,
  BrainCircuit,
  Calculator,
  CalendarRange,
  Eye,
  Smartphone,
} from "lucide-react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { BrandLock, DeltaMark } from "@/components/brand/DeltaMark";
import heroImage from "@/assets/hero-telegram.jpg";
import ogImageAsset from "@/assets/og-image.png.asset.json";
import { LanguageToggle } from "@/components/LanguageToggle";
import { CATEGORY_GROUPS } from "@/components/dulms/categories";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { ensureSessionPersistence } from "@/lib/session-persist";
import { getLanding } from "@/lib/landing.functions";
import { LANDING_DEFAULT } from "@/features/landing/fields";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DULMS Notify — Smart Student Workspace" },
      {
        name: "description",
        content:
          "DULMS dashboard with Telegram alerts, AI account assistance, GPA planning, schedule optimisation and course-registration monitoring.",
      },
      { property: "og:title", content: "DULMS Notify — Smart Student Workspace" },
      {
        property: "og:description",
        content:
          "DULMS dashboard with Telegram alerts, AI account assistance, GPA planning, schedule optimisation and course-registration monitoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: siteUrl(ogImageAsset.url) },
      { property: "og:image:width", content: "1913" },
      { property: "og:image:height", content: "906" },
      { property: "og:image:type", content: "image/png" },
      { name: "twitter:image", content: siteUrl(ogImageAsset.url) },
      { property: "og:url", content: siteUrl("/") },
    ],
    links: [{ rel: "canonical", href: siteUrl("/") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              q: "Is my DULMS password safe?",
              a: "It is encrypted at rest. DULMS Notify reads your academic pages and only submits a registration request when you explicitly enable or confirm that feature.",
            },
            {
              q: "What can the smart tools do?",
              a: "They can plan GPA scenarios, suggest compact schedules, monitor exact lecture and section choices, and assist with registration workflows.",
            },
            {
              q: "How do notifications arrive?",
              a: "Telegram linking is required during setup. The bot receives detected updates and provides menus for browsing synced DULMS sections.",
            },
          ].map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: Index,
});

const FEATURES = [
  { icon: Layers, key: "feat1", tint: "text-muted-foreground" },
  { icon: Send, key: "feat2", tint: "text-muted-foreground" },
  { icon: BrainCircuit, key: "feat3", tint: "text-muted-foreground" },
  { icon: Eye, key: "feat4", tint: "text-muted-foreground" },
  { icon: CalendarRange, key: "feat5", tint: "text-muted-foreground" },
  { icon: Calculator, key: "feat6", tint: "text-muted-foreground" },
  { icon: RefreshCcw, key: "feat7", tint: "text-muted-foreground" },
  { icon: Smartphone, key: "feat8", tint: "text-muted-foreground" },
] as const;

const STATS = [
  { v: "landing.stat1v", l: "landing.stat1" },
  { v: "landing.stat2v", l: "landing.stat2" },
  { v: "landing.stat3v", l: "landing.stat3" },
  { v: "landing.stat4v", l: "landing.stat4" },
] as const;

const STEPS = ["step1", "step2", "step3"] as const;

const CONTACTS = [
  { key: "instagram", icon: Instagram, href: "https://www.instagram.com/hq7o_?stkn=bzJkcDh3MGtkMjE3&utm_source=qr" },
  { key: "linkedin", icon: Linkedin, href: "https://www.linkedin.com/in/hassan-m-1547a1391?utm_source=share_via&utm_content=profile&utm_medium=member_ios" },
  { key: "whatsappEgypt", icon: MessageCircle, href: "https://wa.me/201021714351" },
  { key: "whatsappSaudi", icon: MessageCircle, href: "https://wa.me/966500510367" },
] as const;

function Index() {
  const { t, dir, lang } = useI18n();
  // Landing copy/visuals are operator-editable from the admin panel; the
  // bundled dictionary stays the fallback so the page never renders empty.
  const { data: cfg = LANDING_DEFAULT } = useQuery({
    queryKey: ["landing-config"],
    queryFn: () => getLanding(),
    staleTime: 60_000,
  });
  const tl = (key: string) => {
    const override = cfg.text?.[lang]?.[key];
    return override && override.trim() ? override : t(key);
  };
  const navigate = useNavigate();
  const rtl = dir === "rtl";
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSessionPersistence();
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) {
        await navigate({ to: "/dashboard", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="relative min-h-screen">
      <header className="material-regular sticky top-0 z-30 border-b-[0.5px] border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <BrandLock />
          <div className="flex items-center gap-2">
            {cfg.showLanguage ? <LanguageToggle /> : null}
            {cfg.showSignIn ? (
              <Button asChild size="sm" className="rounded-full">
                <Link to="/auth">{tl("common.signIn")}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main>
        {/* Hero — one calm stage, product shot carries the page */}
        {cfg.showHero ? (
          <section className="mx-auto max-w-5xl px-4 pb-10 pt-16 text-center md:pt-24">
            {cfg.showBadge ? (
              <p className="text-footnote inline-flex items-center gap-2 rounded-full border-[0.5px] border-border px-3.5 py-1.5 font-medium">
                <DeltaMark className="size-4 text-muted-foreground" title="<!-- bypass -->" />
                {tl("landing.badge")}
              </p>
            ) : null}
            <h1 className="text-large-title mx-auto mt-6 max-w-3xl text-balance">
              {tl("landing.headline.pre")}{" "}
              <span className="text-foreground/70">{tl("landing.headline.hi")}</span>{" "}
              {tl("landing.headline.post")}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
              {tl("landing.lead")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-8 text-base">
                <Link to="/auth">
                  {tl("landing.cta")} <Arrow className="ms-2 size-4" />
                </Link>
              </Button>
              {cfg.showCtaNote ? (
                <span className="text-footnote inline-flex items-center gap-1.5">
                  <Lock className="size-3.5" /> {tl("landing.feat4.title")}
                </span>
              ) : null}
            </div>

            {cfg.showHeroImage ? (
              <div className="relative mt-14">
                <div className="relative overflow-hidden rounded-[1.75rem] border-[0.5px] border-border bg-card">
                  <img
                    className="w-full object-cover"
                    src={cfg.heroImage || heroImage}
                    alt={tl("landing.howTitle")}
                    width={1280}
                    height={960}
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Numbers — quiet hairline strip, not a section */}
        {cfg.showStats ? (
          <section className="mx-auto max-w-5xl px-4">
            <div className="grid grid-cols-2 gap-y-6 border-y-[0.5px] border-border py-7 md:grid-cols-4">
              {STATS.filter((s) => !cfg.hiddenStats.includes(s.l.replace("landing.", ""))).map(
                (s) => (
                  <div key={s.l} className="px-2 text-center">
                    <p className="text-title-3 tabular-nums">{tl(s.v)}</p>
                    <p className="text-footnote mt-1 leading-snug">{tl(s.l)}</p>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {/* Coverage + how it works, folded into one screen */}
        <section className="mx-auto max-w-5xl px-4 py-16 md:py-20">
          {cfg.showCover ? (
            <>
              <h2 className="text-title-1 max-w-2xl text-balance">{tl("landing.coverTitle")}</h2>
              <p className="mt-3 max-w-xl text-muted-foreground">{tl("landing.coverSub")}</p>
            </>
          ) : null}

          {cfg.showFeatures ? (
            <div className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.filter((f) => !cfg.hiddenFeatures.includes(f.key)).map((feature) => (
                <article key={feature.key}>
                  <feature.icon className={`size-5 ${feature.tint}`} />
                  <h3 className="text-headline mt-3">{tl(`landing.${feature.key}.title`)}</h3>
                  <p className="text-subhead mt-1.5 leading-relaxed">
                    {tl(`landing.${feature.key}.body`)}
                  </p>
                </article>
              ))}
            </div>
          ) : null}

          {cfg.showChips ? (
            <div className="mt-10 flex flex-wrap gap-2">
              {CATEGORY_GROUPS.map((g) => (
                <span
                  key={g.id}
                  className="text-footnote inline-flex items-center gap-2 rounded-full border-[0.5px] border-border px-3 py-1.5 font-medium"
                >
                  <g.icon className="size-3.5 opacity-60" /> {t(g.labelKey)}
                </span>
              ))}
            </div>
          ) : null}

          {cfg.showSteps ? (
            <ol className="mt-14 grid gap-6 border-t-[0.5px] border-border pt-10 md:grid-cols-3">
              {STEPS.filter((step) => !cfg.hiddenSteps.includes(step)).map((step, i) => (
                <li key={step}>
                  <span className="text-footnote font-semibold tabular-nums text-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-headline mt-2">{tl(`landing.${step}.title`)}</h3>
                  <p className="text-subhead mt-1.5 leading-relaxed">
                    {tl(`landing.${step}.body`)}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        {/* Close */}
        {cfg.showFinal ? (
          <section className="mx-auto max-w-5xl px-4 pb-20">
            <div className="rounded-[1.75rem] border-[0.5px] border-border bg-card px-6 py-12 text-center">
               <BellRing className="mx-auto size-5 text-muted-foreground" />
              <h2 className="text-title-1 mt-4">{tl("landing.finalTitle")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                {tl("landing.finalSub")}
              </p>
              <Button asChild size="lg" className="mt-7 h-12 rounded-full px-8 text-base">
                <Link to="/auth">
                  {tl("landing.cta")} <Arrow className="ms-2 size-4" />
                </Link>
              </Button>
            </div>
          </section>
        ) : null}
      </main>

      {cfg.showFooter ? (
        <footer className="border-t-[0.5px] border-border">
          <div className="mx-auto max-w-5xl px-4 py-12">
            <div className="flex flex-col items-center text-center">
              <h2 className="text-title-2">{tl("landing.contactTitle")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{tl("landing.contactSub")}</p>
              <nav className="mt-7 flex flex-wrap justify-center gap-3" aria-label={tl("landing.contactTitle")}>
                {CONTACTS.map(({ key, icon: Icon, href }) => (
                  <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="social-link">
                    <Icon className="size-5" aria-hidden="true" />
                    <span>{tl(`landing.${key}`)}</span>
                  </a>
                ))}
              </nav>
            </div>
            <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-center text-xs text-muted-foreground sm:flex-row sm:text-start">
              <div>
                <p className="inline-flex items-center gap-1.5"><Copyright className="size-3.5" /> 2026 DULMS Notify · {tl("landing.copyright")}</p>
                <p className="mt-1">{tl("landing.footer")}</p>
              </div>
              <Link to="/policies" className="font-medium text-foreground underline-offset-4 hover:underline">
                {tl("landing.policies")}
              </Link>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
