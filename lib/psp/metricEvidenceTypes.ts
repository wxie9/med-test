import {z} from 'zod';
const id=z.string().min(1),time=z.string().datetime(),sequence=z.number().int().positive();
export const PspQuestionnaireEvidence=z.object({
 id,projectId:id,enrollmentId:id,assignmentId:id,responseId:id,
 scaleId:z.literal('endocrine_monthly_v1'),occurredAt:time,recordedAt:time,actorId:id,sequence,
 revisionOf:id.optional(),stopIntent:z.boolean().nullable(),
 alerts:z.array(z.object({id,kind:z.enum(['symptom','adherence']),level:z.enum(['high','medium']),triggeredAt:time}).strict()),
}).strict();
export type PspQuestionnaireEvidence=z.infer<typeof PspQuestionnaireEvidence>;
export const PspAssignmentCancellation=z.object({
 id,projectId:id,enrollmentId:id,assignmentId:id,occurredAt:time,recordedAt:time,actorId:id,sequence,reason:id,
}).strict();
export type PspAssignmentCancellation=z.infer<typeof PspAssignmentCancellation>;
