/**
 * Per-student browser fingerprint.
 *
 * Every outbound DULMS request used to carry one identical User-Agent, so the
 * portal saw N students behind a single, perfectly uniform client. That is the
 * easiest possible bot signature and it is what caps how fast we can poll.
 *
 * Each account instead gets a stable, realistic desktop-browser profile
 * (User-Agent + matching client hints + language order) derived deterministically
 * from its DULMS id: the same student always looks like the same machine across
 * sessions, while the fleet as a whole looks like ordinary mixed traffic.
 *
 * A small random pause before each request breaks up the lockstep bursts the
 * cron tick would otherwise produce (per-account scheduling jitter already
 * exists in `detect/config.ts`; this is the intra-tick equivalent).
 */

export interface BrowserProfile {
  ua: string;
  /** sec-ch-ua header value, consistent with the UA string. */
  brands: string;
  /** sec-ch-ua-platform value. */
  platform: string;
  acceptLanguage: string;
}

/** Realistic, current desktop profiles. Kept small and boring on purpose. */
const PROFILES: BrowserProfile[] = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    brands: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    platform: '"Windows"',
    acceptLanguage: "ar,en-US;q=0.9,en;q=0.8",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    brands: '"Microsoft Edge";v="130", "Chromium";v="130", "Not?A_Brand";v="99"',
    platform: '"Windows"',
    acceptLanguage: "ar-EG,ar;q=0.9,en;q=0.8",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    brands: '"Google Chrome";v="129", "Chromium";v="129", "Not=A?Brand";v="8"',
    platform: '"Windows"',
    acceptLanguage: "ar,en;q=0.8",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    brands: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    platform: '"macOS"',
    acceptLanguage: "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    brands: '"Google Chrome";v="130", "Chromium";v="130", "Not?A_Brand";v="99"',
    platform: '"Linux"',
    acceptLanguage: "ar,en-GB;q=0.9,en;q=0.8",
  },
];

/** Fallback profile for callers with no identity (probe, ad-hoc login checks). */
export const DEFAULT_PROFILE: BrowserProfile = PROFILES[0]!;

function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final avalanche: FNV alone leaves nearby numeric ids in the same bucket
  // once we take a small modulus, which would defeat the whole point.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable profile for a student id — same input always yields the same client. */
export function browserProfile(seed: string): BrowserProfile {
  if (!seed) return DEFAULT_PROFILE;
  return PROFILES[hash(seed) % PROFILES.length]!;
}

/** Header block sent with every DULMS request for this identity. */
export function profileHeaders(profile: BrowserProfile): Record<string, string> {
  return {
    "user-agent": profile.ua,
    "accept-language": profile.acceptLanguage,
    "sec-ch-ua": profile.brands,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": profile.platform,
    "upgrade-insecure-requests": "1",
  };
}

/** Upper bound of the random pause before an outbound request, in ms. */
function jitterCeilingMs(): number {
  const raw = Number(process.env["DULMS_REQUEST_JITTER_MS"]);
  return Number.isFinite(raw) && raw >= 0 ? raw : 300;
}

/** Desynchronises requests that would otherwise leave in one burst. */
export async function requestPause(): Promise<void> {
  const ceiling = jitterCeilingMs();
  if (ceiling <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * ceiling)));
}
