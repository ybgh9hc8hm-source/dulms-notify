/**
 * Single source of truth for public site identity.
 *
 * Canonical URLs, structured data, sitemap entries and the links the bots send
 * all read from here, so moving the app to another domain is a one-line change
 * (or an env override at build time) instead of a search-and-replace.
 */

const DEFAULT_SITE_URL = "https://dulms-notify.lovable.app";

function normalise(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Public origin of the deployed app, without a trailing slash. */
export const SITE_URL = normalise(
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_APP_URL"]) ||
    DEFAULT_SITE_URL,
);

/** Builds an absolute URL for a site-relative path. */
export function siteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const SITE_NAME = "DULMS Notify";

export const SITE_DESCRIPTION =
  "Live alerts for quizzes, assignments, grades and schedules from Delta University's DULMS.";

/** Author / rights holder shown in the UI and in structured data. */
export const SITE_AUTHOR = "Eng. HASSAN MOHAMED";
