import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState =
  | "unavailable" // not a PWA-capable context
  | "installed" // already running standalone
  | "ready" // Android: beforeinstallprompt captured
  | "ios" // iOS Safari: manual Add to Home Screen
  | "manual"; // other browsers: manual via menu

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function useInstallPWA() {
  const [state, setState] = useState<InstallState>("unavailable");
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) {
      setState("installed");
      return;
    }
    if (isIOS()) {
      setState("ios");
      return;
    }
    setState("manual");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setState("ready");
    };
    const onInstalled = () => {
      setState("installed");
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferred) return "unavailable";
    await deferred.prompt();
    const res = await deferred.userChoice;
    setDeferred(null);
    return res.outcome;
  }

  return { state, promptInstall, isIOS: state === "ios" };
}
