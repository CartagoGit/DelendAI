import z from 'zod';

export const VALIDATE_EVIDENCE_SCHEMA = z.object({
	timestamp: z.string().min(1),
	exitCode: z.number().int(),
	logPath: z.string().min(1).optional(),
});

export type IValidateEvidenceInput = z.infer<typeof VALIDATE_EVIDENCE_SCHEMA>;
