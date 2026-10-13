import Link from "next/link";
import { displayName } from "@/lib/patient/display";
/** Patient link: "王女士 P-A" for named anchors, just "患者 P-0001" otherwise (no duplicated ID). */
export function PatientName({ id }: { id: string }) {
  const name = displayName(id);
  return (
    <>
      <Link href={`/clinic/patients/${encodeURIComponent(id)}`} className="text-pink-700 hover:underline">{name}</Link>
      {name !== `患者 ${id}` && <span className="ml-1 text-xs text-gray-400">{id}</span>}
    </>
  );
}
