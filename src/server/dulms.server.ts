/**
 * DULMS reader — public surface.
 *
 * dulms.deltauniv.edu.eg is an ASP.NET MVC portal: the pages are shells and all
 * real data comes from internal JSON endpoints the site's own JavaScript calls.
 * We sign in with the student's credentials, keep the session cookie, then hit
 * those endpoints directly. Server-only module.
 *
 * Implementation lives in `./dulms/*`:
 *   types.ts      — domain types shared by every mapper
 *   http.ts       — cookie jar, sign-in, JSON + file transport
 *   parse.ts      — pure value/row helpers
 *   row-types.ts  — row shapes of the endpoints we map explicitly
 *   scrape.ts     — the main pass over the core sections
 *   profile.ts    — student identity / GPA summary card
 *   extras.ts     — every remaining section
 */

export type { DulmsProfile, ItemKind, Row, ScrapedItem } from "./dulms/types";
export { DulmsAuthError, loginToDulms } from "./dulms/http";
export { scrapeDulms } from "./dulms/scrape";
