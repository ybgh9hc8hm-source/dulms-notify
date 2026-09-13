/**
 * Presentation layer of the AI support assistant.
 *
 * The model is asked to answer in a fixed, compact structure (title line +
 * short bullets + optional next-step line). Here we turn that structure into
 * Telegram HTML that matches the notification bot's look: <b> titles, "•"
 * bullets, <i> hints, no tables, no Markdown leftovers.
 */

/**
 * Removes model "thinking" that leaks into the answer.
 *
 * Free reasoning models (nemotron, deepseek-r1, qwen-thinking) sometimes emit
 * their scratchpad before the real answer — "The user is asking…", a <think>
 * block, or a raw dump of the account snapshot. The answer template always
 * starts with a **bold title**, so everything before the first title line is
 * scratchpad and is dropped.
 */
export function sanitizeReply(reply: string): string {
  let text = reply.replace(/\r/g, "");
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/^[\s\S]*?<\/think>/i, "");

  // Drop every leading scratchpad paragraph ("The user is asking…", "Let me…",
  // "From the snapshot:") instead of only the first one.
  const scratchpad =
    /^(the user|okay|ok,|let me|i need to|first,|from the snapshot|looking at|we need|thinking|here('| i)s (what|the)|based on the snapshot)/i;
  const paragraphs = text.split(/\n\s*\n/);
  let start = 0;
  while (start < paragraphs.length - 1 && scratchpad.test(paragraphs[start]!.trim())) start += 1;
  if (start > 0) text = paragraphs.slice(start).join("\n\n");

  // Never echo the internal snapshot annotations back to the student.
  text = text.replace(/\s*\[(?:المصدر|source)\s*:[^\]]*\]/gi, "");

  // The answer must stay plain and compact: no markdown headings, bold/italic
  // markers, horizontal rules, emoji ticks, or blank-line padding.
  text = text
    .replace(/^\s*(#{1,6})\s*/gm, "")
    .replace(/^\s*([-*_]\s*){3,}\s*$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(?!\s)([^*\n]+?)\*(?=\s|$)/g, "$1$2")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/[\u2705\u2714\u274C\u2757\u26A0\u2B50\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/\uFE0F/gu, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline **bold** / *italic* / `code` after escaping. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,،:]|$)/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Converts the assistant's structured plain text into Telegram HTML. */
export function toTelegramHtml(reply: string): string {
  const lines = reply.replace(/\r/g, "").split("\n");
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    // Markdown headings become bold titles.
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(`<b>${inline(heading[1]!)}</b>`);
      continue;
    }

    // Bullets: -, *, • → unified "•".
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      out.push(`• ${inline(bullet[1]!)}`);
      continue;
    }

    // Numbered steps keep their number.
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      out.push(`${numbered[1]}. ${inline(numbered[2]!)}`);
      continue;
    }

    out.push(inline(line));
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
