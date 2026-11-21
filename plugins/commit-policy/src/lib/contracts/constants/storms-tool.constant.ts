/**
 * The advertised output shape of `commit_policy_storms`.
 *
 * It lives here rather than beside the tool because `types-in-contracts`
 * keeps exported types and constants in `contracts/`, and the spec needs
 * to assert the schema the tool actually advertises:
 *
 *     withOkEnvelope(STORMS_OUTPUT_SCHEMA).strict().parse(structuredContent)
 *
 * `ok` is NOT declared here on purpose: `toolOk` supplies the envelope,
 * and `withOkEnvelope` adds it at registration, so the payload schema
 * stays exactly what the service returns.
 */
import z from 'zod';

const IStormSchema = z.object({
	code: z.string(),
	trigger: z.string(),
	count: z.number().int().nonnegative(),
	windowSeconds: z.number().int().positive(),
	sampleProposalIds: z.array(z.string()),
	firstSeenAt: z.string().datetime(),
	windowStartedAt: z.string().datetime(),
	lastSeenAt: z.string().datetime(),
	suggestedFix: z.string().optional(),
	exceedsThreshold: z.boolean(),
});

export const STORMS_OUTPUT_SCHEMA = z.object({
	storms: z.array(IStormSchema),
	totalEventsInWindow: z.number().int().nonnegative(),
	windowSeconds: z.number().int().positive(),
	threshold: z.number().int().positive(),
});
