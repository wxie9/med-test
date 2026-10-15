import {z} from 'zod';
const id=z.string().min(1),version=z.number().int().positive(),time=z.string().datetime({offset:true}),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const ReviewInputSchema=z.discriminatedUnion('decision',[
 z.object({kind:z.enum(['data','medical']),decision:z.literal('approve')}).strict(),
 z.object({kind:z.enum(['data','medical']),decision:z.literal('return'),reason:z.string().trim().min(1).max(1000)}).strict(),
]);
export type ReportReviewInput={kind:'data'|'medical';decision:'approve'|'return';reason?:string};
const binding={id,projectId:id,seedVersion:version,reportVersionId:id,revision:version,snapshotId:id,snapshotDigest:digest,contentDigest:digest,templateVersion:z.literal('psp-report-template-v1'),algorithmVersion:z.literal('psp-metrics-v1'),protectionVersion:z.literal('psp-k5-v1'),occurredAt:time,recordedAt:time,actorId:id,sequence:version,previousVersion:version,newVersion:version,clientRequestId:id,submissionId:id,submittedVersion:version};
export const ReportSubmitEventSchema=z.object({...binding,action:z.literal('submit'),role:z.literal('project_manager')}).strict();
export const ReportReviewEventSchema=z.object({...binding,action:z.literal('review'),role:z.enum(['data_reviewer','medical_reviewer']),kind:z.enum(['data','medical']),decision:z.enum(['approve','return']),reason:z.string().min(1).max(1000).optional()}).strict();
export const ReportActionEventSchema=z.discriminatedUnion('action',[ReportSubmitEventSchema,ReportReviewEventSchema]);
export type ReportSubmitEvent=z.infer<typeof ReportSubmitEventSchema>;
export type ReportReviewEvent=z.infer<typeof ReportReviewEventSchema>;
export type ReportActionEvent=z.infer<typeof ReportActionEventSchema>;
export type ReportActionGates={canSubmit:boolean;canApprove:boolean;canReturn:boolean;canRevise:boolean;reviewKind:'data'|'medical'|null;submitReason:string|null;reviewReason:string|null;reviseReason:string|null};
