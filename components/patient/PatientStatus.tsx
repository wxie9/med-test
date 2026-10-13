/** Loading / error placeholder for patient pages. */
export function PatientStatus({ error }: { error: Error | null }) {
  return <p className="p-4 text-sm text-gray-500">{error ? `加载失败：${error.message}` : "加载中…"}</p>;
}
