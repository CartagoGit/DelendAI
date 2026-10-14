import { z } from 'zod';

export const StashSchema = z.object({
	/** Whether agents may create, apply, list, or drop git stashes. */
	enabled: z.boolean().default(false),
});

export type ICommitPolicyStash = z.infer<typeof StashSchema>;
