import { z } from 'zod';
import { ProResponse } from '@/lib/domain/types';
import { SCALE_SYMPTOMS } from './scales';
export const ProInputFields = {
  patientId: z.string().min(1),
  scaleId: ProResponse.shape.scaleId,
  items: z.record(z.number().int().min(0).max(3)),
  flags: z.object({ stopIntent: z.boolean().optional(), missedDoses14d: z.number().int().min(0).max(14).optional() }).strict(),
};
export function validateProItems(body: {scaleId:ProResponse['scaleId'];items:Record<string,number>;flags:ProResponse['flags']}, ctx:z.RefinementCtx) {
  const symptoms = SCALE_SYMPTOMS[body.scaleId];
  if (Object.keys(body.items).length !== symptoms.length || symptoms.some(s => !Object.hasOwn(body.items, s)))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'items must contain every symptom of the selected scale, and no unknown symptoms' });
  if (body.scaleId === 'treatment_weekly_v1' && Object.keys(body.flags).length > 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['flags'], message: 'weekly scale does not accept endocrine adherence flags' });
}
// Preserve the generic endpoint's existing treatment of unknown top-level keys.
export const ProBody = z.object(ProInputFields).superRefine(validateProItems);
