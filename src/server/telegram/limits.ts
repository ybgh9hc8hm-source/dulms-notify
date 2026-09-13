/**
 * Telegram payload limits.
 *
 * `sendMessage`/`editMessageText` reject any text longer than 4096 UTF-16
 * units with `400 Bad Request: message is too long`, and the failure surfaces
 * as a generic API error — the student simply never receives the update. A
 * long AI answer, a long scraped notice, or a page of long notification
 * bodies can all cross the line, so every outbound text goes through here.
 */

export const TELEGRAM_TEXT_LIMIT = 4096;
/** Inline-button payload cap enforced by Telegram (bytes, UTF-8). */
export const TELEGRAM_CALLBACK_DATA_LIMIT = 64;

/**
 * Splits text into sendable chunks, preferring line boundaries so HTML tags
 * (which never span lines in our formatters) stay intact.
 */
export function chunkTelegramText(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    // A single line longer than the limit is hard-split.
    if (line.length > limit) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      continue;
    }
    if (current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Trims text for an *edit*, where multiple messages are not an option (the
 * inline menu is a single message that gets rewritten in place).
 */
export function truncateTelegramText(text: string, limit = TELEGRAM_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  const suffix = "\n…";
  return `${text.slice(0, limit - suffix.length)}${suffix}`;
}
