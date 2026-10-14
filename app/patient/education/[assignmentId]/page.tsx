"use client";
import { useParams } from "next/navigation";
import { usePatientId } from "@/lib/client/patientContext";
import { PatientEducation } from "@/components/psp/PatientEducation";
export default function PatientEducationPage() {
 const { assignmentId } = useParams<{ assignmentId: string }>();
 const patientId = usePatientId();
 let decoded: string;
 try { decoded = decodeURIComponent(assignmentId); } catch { return <p role="alert" className="mx-3 my-3 text-sm text-red-700">教育计划地址无效，请从已发送资料列表重新打开。</p>; }
 return <PatientEducation key={`${patientId}:${decoded}`} patientId={patientId} assignmentId={decoded} />;
}
