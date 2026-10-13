/** Loading / error placeholder shared by research pages. */
export function PageStatus({ error }: { error: string | null }) {
  return <p className={`text-sm ${error ? "text-red-600" : "text-gray-500"}`}>{error ?? "加载中…"}</p>;
}
