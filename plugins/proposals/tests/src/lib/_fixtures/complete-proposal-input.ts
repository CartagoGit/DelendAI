/**
 * `create_proposal` refuses a proposal whose Goal, Why, Non-goals or slice
 * acceptance it would have to invent. Specs that only care about what
 * happens AFTER a proposal exists build it through this one helper, which
 * keeps every value the spec wrote and fills only what it left out.
 */
interface ISliceInput {
	readonly sliceId: string;
	readonly files: readonly string[];
	readonly acceptance?: readonly string[] | undefined;
	readonly [key: string]: unknown;
}

export interface IProposalInput {
	readonly goal?: string | undefined;
	readonly why?: string | undefined;
	readonly nonGoals?: readonly string[] | undefined;
	readonly slices?: readonly ISliceInput[] | undefined;
	readonly [key: string]: unknown;
}

/** The acceptance a completed slice carries when its spec wrote none. */
export const DEFAULT_ACCEPTANCE = 'The slice does what the spec checks.';

/** Review evidence that covers `DEFAULT_ACCEPTANCE`. */
export const DEFAULT_ACCEPTANCE_EVIDENCE = {
	commitHash: 'abc1234',
	validateExitCode: 0,
	testsPassing: 3,
	testsTotal: 3,
	acceptanceCriteria: [
		{ criterion: DEFAULT_ACCEPTANCE, evidence: 'checked by the spec' },
	],
} as const;

export const completeProposalInput = <T extends IProposalInput>(
	input: T,
): T & {
	readonly goal: string;
	readonly why: string;
	readonly nonGoals: readonly string[];
	readonly slices: readonly ISliceInput[];
} => ({
	...input,
	goal: input.goal ?? 'A goal the spec states.',
	why: input.why ?? 'A reason the spec states.',
	nonGoals: input.nonGoals ?? ['Nothing beyond what the spec exercises.'],
	slices: (input.slices ?? [{ sliceId: 'S1', files: ['src/a.ts'] }]).map(
		(slice) => ({
			...slice,
			acceptance: slice.acceptance ?? [
				'The slice does what the spec checks.',
			],
		}),
	),
});

/** A `create_proposal` handler that completes what its caller left out. */
export const completing =
	<R>(handler: (args: unknown) => Promise<R>) =>
	(args: unknown): Promise<R> =>
		handler(
			typeof args === 'object' && args !== null
				? completeProposalInput(args as IProposalInput)
				: args,
		);
