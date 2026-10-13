import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseInline, parseMarkdown } from "@/lib/docs/markdown";
describe("mini markdown", () => {
  it("parses headings, lists, code, tables and paragraphs", () => {
    const md = ["# 标题", "", "## 小节", "### 子节", "- 甲", "- 乙", "1. 一", "2. 二", "```bash", "npm run demo", "```",
      "| 步骤 | 页面 |", "|---|---|", "| 1 | `/` |", "第一行", "接着一行", ""].join("\n");
    expect(parseMarkdown(md)).toEqual([
      { kind: "heading", level: 1, text: "标题" }, { kind: "heading", level: 2, text: "小节" }, { kind: "heading", level: 3, text: "子节" },
      { kind: "ul", items: ["甲", "乙"] }, { kind: "ol", items: ["一", "二"] }, { kind: "code", text: "npm run demo" },
      { kind: "table", header: ["步骤", "页面"], rows: [["1", "`/`"]] }, { kind: "paragraph", text: "第一行 接着一行" },
    ]);
  });
  it("splits inline code and strong spans", () => {
    expect(parseInline("打开 `/` 点击 **一键重置** 即可")).toEqual([
      { kind: "text", text: "打开 " }, { kind: "code", text: "/" }, { kind: "text", text: " 点击 " }, { kind: "strong", text: "一键重置" }, { kind: "text", text: " 即可" },
    ]);
  });
  it("renders the shipped demo script without stray table rows", () => {
    const blocks = parseMarkdown(readFileSync("docs/demo-script.md", "utf8"));
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
    expect(blocks.some(b => b.kind === "table")).toBe(true);
    expect(blocks.filter(b => b.kind === "paragraph" && b.text.startsWith("|"))).toEqual([]);
  });
});
