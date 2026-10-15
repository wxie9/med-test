import {z} from 'zod';
import {NextActionSchema,ReportFactSchema} from './reportTypes';
import {SnapshotWindowSchema} from './snapshotTypes';
const id=z.string().min(1),digest=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime({offset:true});
export const PublicReportContentSchema=z.object({title:id,notice:id,chapters:z.array(z.object({title:id,paragraphs:z.array(z.string()),facts:z.array(ReportFactSchema.omit({id:true}))}).strict()).length(7)}).strict();
export const DeliveryBodySchema=z.object({id,projectId:id,revision:z.number().int().positive(),window:SnapshotWindowSchema,templateVersion:z.literal('psp-report-template-v1'),algorithmVersion:z.literal('psp-metrics-v1'),protectionVersion:z.literal('psp-k5-v1'),contentDigest:digest,content:PublicReportContentSchema,nextActions:z.array(NextActionSchema),signatures:z.array(z.object({role:z.enum(['data_reviewer','medical_reviewer']),occurredAt:time}).strict()).length(2),delivery:z.object({deliveredAt:time}).strict()}).strict();
export const DeliveryArtifactSchema=z.object({reportVersionId:id,deliveryEventId:id,body:DeliveryBodySchema,text:z.string().min(1),digest}).strict();
export type DeliveryArtifact=z.infer<typeof DeliveryArtifactSchema>;
export type PharmaActionReceipt={id:string;projectId:string;version:number;status:'accepted'|'client_changes_requested';event:{id:string;action:'accept'|'request_changes';occurredAt:string}};
