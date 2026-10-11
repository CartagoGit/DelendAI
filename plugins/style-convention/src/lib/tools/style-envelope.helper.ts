import type z from 'zod';

import { toolError } from '@delendai/core/public';

/** The refusal every style tool gives for arguments it cannot read. */
export const invalidArguments = (issues: readonly z.core.$ZodIssue[]) =>
	toolError(
		issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; '),
		'Fix the arguments and call again.',
		'invalid-arguments',
	);
