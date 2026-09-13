/** Rewrite raw 24-hour clock strings inside scraped text to Arabic 12-hour form. */
export function to12h(text: string | null | undefined): string {
  const value = (text ?? "").toString();
  if (!value) return "";
  return value.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_m, h: string, m: string) => {
    const hour = Number(h);
    const suffix = hour < 12 ? "ص" : "م";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${m} ${suffix}`;
  });
}
