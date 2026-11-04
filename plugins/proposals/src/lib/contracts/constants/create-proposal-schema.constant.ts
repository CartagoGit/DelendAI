import z from 'zod';
import { callerCheckout } from '@delendai/core/public';

export const SLICE_IN = z.object({
	sliceId: z.string(),
	title: z.string().optional(),
	files: z.array(z.string()),
	gate: z.enum(['lint', 'type', 'e2e', 'none']).optional(),
	dependsOn: z.array(z.string()).optional(),
	acceptance: z.array(z.string()).optional(),
});

export const CREATE_PROPOSAL_INPUT_SCHEMA = z.object({
	id: z.string().optional(),
	kind: z
		.enum([
			'feat',
			'breaking',
			'fix',
			'refactor',
			'perf',
			'audit',
			'chore',
			'docs',
			'test',
			'infra',
			'spike',
			'legacy',
			'resume',
			// Expose the cross-cutting proposal kinds (`plan`,
			// `repair`) declared in `proposal-glossary.constant.ts` so
			// callers do not have to fall back to `chore` (which uses
			// prefix `c`) just to mint a `qNNNNN-...` plan proposal. The
			// downstream `prefixForKind` resolution already honours both;
			// only the input schema was lagging.
			'plan',
			'repair',
		])
		.optional(),
	title: z.string(),
	goal: z.string().optional(),
	status: z
		.enum(['pending', 'ready', 'in_progress', 'in-progress'])
		.optional(),
	track: z.string().optional(),
	why: z.string().optional(),
	nonGoals: z.array(z.string()).optional(),
	globalGate: z.enum(['lint', 'type', 'e2e', 'none']).optional(),
	slices: z.array(SLICE_IN).optional(),
	checkout: callerCheckout.arg.optional(),
});

export const CREATE_PROPOSAL_OUTPUT_SCHEMA = z.object({
	ok: z.literal(true),
	/** The id the proposal was given. */
	id: z.string(),
	file: z.string(),
	path: z.string(),
	disjointnessIssues: z.array(
		z.object({
			first: z.string(),
			second: z.string(),
			file: z.string(),
		}),
	),
	indexCount: z.number(),
	redactedSecrets: z.number().int().nonnegative().optional(),
	/** How to publish the file just written; never optional, see the helper. */
	nextAction: z.string(),
	/**
	 * Whether the tool itself got the proposal onto its publication ref.
	 *
	 * `nextAction` alone was advice, and advice is what an agent skips —
	 * twice in one week a proposal was left untracked in a shared
	 * checkout. When this is `true` the work already reached the remote
	 * and `publishedRef` names where; when it is `false`,
	 * `publishReason` says why, and `nextAction` is still owed.
	 */
	published: z.boolean(),
	/** The ref the proposal was published on, when one was derived. */
	publishedRef: z.string().optional(),
	/** Why publication did not happen, when it did not. */
	publishReason: z.string().optional(),
	/** The unit the proposal was written in, under the name it has now. */
	unitBranch: z.string().optional(),
	/** The name a unit entered for `new` had before it took the id. */
	unitRenamedFrom: z.string().optional(),
});
