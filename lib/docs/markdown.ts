/** Minimal Markdown block parser for the in-app demo script: headings, lists, fenced code, pipe tables, paragraphs. */
export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "paragraph"; text: string };
export type Inline = { kind: "text" | "code" | "strong"; text: string };

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
const UL = /^\s*[-*]\s+(.*)$/, OL = /^\s*\d+[.)]\s+(.*)$/, HEADING = /^(#{1,3})\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith("```")) {
      const body: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++; out.push({ kind: "code", text: body.join("\n") }); continue;
    }
    const h = line.match(HEADING);
    if (h) { out.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text: h[2].trim() }); i++; continue; }
    if (isRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = cells(line); const rows: string[][] = []; i += 2;
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      out.push({ kind: "table", header, rows }); continue;
    }
    const list = UL.test(line) ? { re: UL, kind: "ul" as const } : OL.test(line) ? { re: OL, kind: "ol" as const } : null;
    if (list) {
      const items: string[] = [];
      while (i < lines.length && list.re.test(lines[i])) items.push(lines[i++].match(list.re)![1].trim());
      out.push({ kind: list.kind, items }); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !HEADING.test(lines[i]) && !UL.test(lines[i]) && !OL.test(lines[i]) && !lines[i].trim().startsWith("```") && !isRow(lines[i])) para.push(lines[i++].trim());
    if (para.length) out.push({ kind: "paragraph", text: para.join(" ") });
    else { out.push({ kind: "paragraph", text: line.trim() }); i++; } // e.g. a stray pipe row without a divider
  }
  return out;
}

/** Splits `code` and **strong** spans; everything else is plain text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { kind: "code", text: m[1] } : { kind: "strong", text: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
