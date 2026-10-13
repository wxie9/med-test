import { readFileSync } from "node:fs";
import path from "node:path";
import { parseInline, parseMarkdown, type Block } from "@/lib/docs/markdown";
export const dynamic = "force-dynamic"; // re-read docs/demo-script.md on every request

function Text({ text }: { text: string }) {
  return <>{parseInline(text).map((s, i) => s.kind === "code"
    ? <code key={i} className="rounded bg-gray-100 px-1 font-mono text-[0.9em]">{s.text}</code>
    : s.kind === "strong" ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>)}</>;
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case "heading":
      if (b.level === 1) return <h1 className="text-2xl font-bold"><Text text={b.text} /></h1>;
      if (b.level === 2) return <h2 className="mt-8 border-b border-gray-200 pb-1 text-xl font-semibold"><Text text={b.text} /></h2>;
      return <h3 className="mt-5 text-lg font-semibold"><Text text={b.text} /></h3>;
    case "ul": return <ul className="list-disc space-y-1 pl-6">{b.items.map((t, i) => <li key={i}><Text text={t} /></li>)}</ul>;
    case "ol": return <ol className="list-decimal space-y-1 pl-6">{b.items.map((t, i) => <li key={i}><Text text={t} /></li>)}</ol>;
    case "code": return <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm text-gray-100">{b.text}</pre>;
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-left"><tr>{b.header.map((h, i) => <th key={i} className="whitespace-nowrap border border-gray-200 px-2 py-1.5 font-semibold"><Text text={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{b.header.map((_, j) => <td key={j} className={`border border-gray-200 px-2 py-1.5 align-top ${j === 0 ? "whitespace-nowrap" : ""}`}><Text text={r[j] ?? ""} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "paragraph": return <p className="leading-7"><Text text={b.text} /></p>;
  }
}

export default function DemoScriptPage() {
  let src: string;
  try { src = readFileSync(path.join(process.cwd(), "docs", "demo-script.md"), "utf8"); }
  catch { return <main className="mx-auto max-w-5xl px-6 py-10"><p className="text-sm text-red-600">未找到 docs/demo-script.md</p></main>; }
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
      {parseMarkdown(src).map((b, i) => <BlockView key={i} b={b} />)}
    </main>
  );
}
