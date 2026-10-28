import z from 'zod';

// MCP hosts commonly cancel a tool call after one minute. Keep the
// close-slice validation below that deadline so callers receive the
// structured validation error and the document mutex is always released.
export const CLOSE_SLICE_VALIDATION_TIMEOUT_MS = 45_000;

export const CLOSE_SLICE_GATE_SCHEMA = z
	.object({
		state: z.enum(['pass', 'fail', 'pending', 'unverifiable']),
		reused: z.boolean(),
		handle: z.string().optional(),
		tree: z.string().optional(),
		certifiedBy: z
			.enum(['forge-check', 'landing-certification', 'recorded-gate'])
			.optional(),
		evidence: z.string().optional(),
		nextAction: z.string().optional(),
	})
	.optional();

export const TIMEOUT_EXIT_CODE = 124;
