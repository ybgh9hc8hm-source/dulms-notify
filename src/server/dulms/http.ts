/** DULMS transport layer: cookie jar, sign-in, JSON + file endpoints. */
import type { Row } from "./types";
import { endpointLabel, recordHealthSample } from "./health";
import {
  browserProfile,
  DEFAULT_PROFILE,
  profileHeaders,
  requestPause,
  type BrowserProfile,
} from "./browser-profile";

export const BASE = "https://dulms.deltauniv.edu.eg";
/** Fallback User-Agent for call sites without a student identity. */
export class Jar {
  private cookies = new Map<string, string>();
  /** Stable browser fingerprint for the student this jar belongs to. */
  readonly profile: BrowserProfile;

  constructor(identity = "") {
    this.profile = browserProfile(identity);
  }

  /** Client headers every request made with this jar must carry. */
  clientHeaders(): Record<string, string> {
    return profileHeaders(this.profile);
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  /** Serialized form kept in `dulms_sessions.cookie_data`. */
  serialize(): string {
    return JSON.stringify([...this.cookies]);
  }

  static deserialize(raw: string, identity = ""): Jar {
    const jar = new Jar(identity);
    try {
      const pairs = JSON.parse(raw) as [string, string][];
      if (Array.isArray(pairs)) for (const [k, v] of pairs) jar.cookies.set(k, v);
    } catch {
      /* corrupt cache entry → empty jar, caller will re-login */
    }
    return jar;
  }

  get size(): number {
    return this.cookies.size;
  }

  absorb(res: Response) {
    const raw =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
      "function"
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
    for (const line of raw) {
      const pair = line.split(";")[0] ?? "";
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
}

export async function request(
  jar: Jar,
  url: string,
  init: RequestInit = {},
): Promise<{ url: string; html: string }> {
  let current = new URL(url, BASE).toString();
  let options: RequestInit = init;

  for (let hop = 0; hop < 6; hop++) {
    const startedAt = Date.now();
    await requestPause();
    const res = await fetch(current, {
      ...options,
      redirect: "manual",
      headers: {
        ...jar.clientHeaders(),
        ...(options.headers as Record<string, string> | undefined),
        ...(jar.header() ? { cookie: jar.header() } : {}),
      },
    });

    jar.absorb(res);

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      void recordHealthSample({
        endpoint: endpointLabel(current),
        statusCode: res.status,
        latencyMs: Date.now() - startedAt,
      });
      current = new URL(location, current).toString();
      options = {};
      continue;
    }
    const html = await res.text();
    void recordHealthSample({
      endpoint: endpointLabel(current),
      statusCode: res.status,
      latencyMs: Date.now() - startedAt,
      body: html,
    });
    return { url: current, html };
  }
  throw new Error("تم تجاوز الحد الأقصى لعدد التحويلات على موقع الجامعة");
}

function hiddenField(html: string, name: string): string {
  const match =
    html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`)) ??
    html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`));
  return match?.[1] ?? "";
}

export class DulmsAuthError extends Error {}

export async function loginToDulms(dulmsId: string, password: string) {
  const jar = new Jar(dulmsId);
  const loginPage = await request(jar, "/login.aspx");

  const body = new URLSearchParams({
    __VIEWSTATE: hiddenField(loginPage.html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: hiddenField(loginPage.html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: hiddenField(loginPage.html, "__EVENTVALIDATION"),
    txtname: dulmsId,
    txtPass: password,
    type: "1",
    Button1: "Login",
  });

  const result = await request(jar, "/login.aspx", {
    method: "POST",
    body: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

  if (/enter correct username and password|بيانات غير صحيحة/i.test(result.html)) {
    void recordHealthSample({
      endpoint: "/login.aspx",
      statusCode: 200,
      latencyMs: 0,
      reason: "auth_failure",
      detail: { kind: "bad_credentials" },
    });
    throw new DulmsAuthError("كود الطالب أو كلمة المرور غير صحيحة");
  }
  if (/name="txtPass"/i.test(result.html)) {
    void recordHealthSample({
      endpoint: "/login.aspx",
      statusCode: 200,
      latencyMs: 0,
      reason: "auth_failure",
      detail: { kind: "login_rejected" },
    });
    throw new DulmsAuthError("تعذّر تسجيل الدخول على DULMS، جرّب تحديث بياناتك");
  }

  return { jar, landing: result };
}

/* -------------------------------------------------------------------------- */
/*  File download proxy                                                       */
/*  DULMS files (materials, payment slips, course specs, …) live behind the   */
/*  student's session cookies. Re-login with the stored credentials, then     */
/*  fetch the raw bytes so the browser can open or download them via a blob. */
/* -------------------------------------------------------------------------- */

/** Calls one of the portal's internal JSON endpoints with the student session. */
export async function api<T>(
  jar: Jar,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<T[]> {
  await requestPause();
  const res = await fetch(new URL(path, BASE).toString(), {
    method,
    headers: {
      ...jar.clientHeaders(),
      cookie: jar.header(),
      "content-type": "application/json; charset=utf-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, text/javascript, */*; q=0.01",
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? null) } : {}),
  });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Same call, but for endpoints that answer with a single JSON object. */
export async function apiObj(
  jar: Jar,
  path: string,
  method: "GET" | "POST" = "POST",
  body?: unknown,
): Promise<Row | null> {
  await requestPause();
  const res = await fetch(new URL(path, BASE).toString(), {
    method,
    headers: {
      ...jar.clientHeaders(),
      cookie: jar.header(),
      "content-type": "application/json; charset=utf-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, text/javascript, */*; q=0.01",
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? null) } : {}),
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return (parsed[0] as Row) ?? null;
    return typeof parsed === "object" && parsed ? (parsed as Row) : null;
  } catch {
    return null;
  }
}
