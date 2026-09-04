/**
 * policy.ts — the test-writing policy engine (f00115 S1).
 *
 * A workspace declares HOW agents must handle tests through one of four
 * modes. The resolver applies the precedence chain:
 *
 *   runtime override (set tool) > host config (`options.mode`) > `tdd`.
 *
 * The guidance tables are the actionable half of the contract: every
 * mode ships imperative steps an agent can follow verbatim, and the
 * plugin surfaces them through `get_test_policy` and a knowledge entry
 * so every LLM sees the same contract at orientation.
 */

export const TEST_POLICY_MODES = [
	'tdd',
	'tests-after',
	'free',
	'none',
] as const;

export type ITestPolicyMode = (typeof TEST_POLICY_MODES)[number];

/** Where the resolved mode came from (highest-precedence wins). */
export type ITestPolicySource = 'override' | 'config' | 'default';

export interface IResolvedTestPolicy {
	readonly mode: ITestPolicyMode;
	readonly source: ITestPolicySource;
}

/**
 * Imperative, agent-actionable guidance per mode. Every line is a step
 * or a rule — no philosophy. `tdd` is the default and intentionally the
 * strictest: red before green, always.
 */
export const POLICY_GUIDANCE: Readonly<
	Record<ITestPolicyMode, readonly string[]>
> = {
	tdd: [
		'Write the failing test FIRST: before touching implementation code, add the spec that pins the new behaviour.',
		'Prove it red: run the spec and confirm it fails for the expected reason before implementing.',
		'Implement the minimum that turns the spec green, then refactor with the suite green.',
		'Never delete or weaken a failing assertion to get to green — fix the code, not the test.',
	],
	'tests-after': [
		'Implement the change first, then write the specs that cover the new behaviour BEFORE closing the task.',
		'Every changed public behaviour needs at least one assertion; bug fixes need a regression test that fails on the old code.',
		'Do not hand off or close a slice with the new behaviour uncovered.',
	],
	free: [
		'You decide whether and when tests are worth writing for this change.',
		'State your choice explicitly in your summary ("tests: added X / skipped because Y") so the reviewer sees the trade-off.',
		'The existing suite must still pass; skipping NEW tests never justifies breaking OLD ones.',
	],
	none: [
		'Do NOT write or modify tests for this work (prototype/spike mode).',
		'The existing suite must still pass — this mode skips new coverage, it does not waive the validation gate.',
		'Flag any behaviour you would have tested in your summary so the debt is visible.',
	],
};

export interface IResolveTestPolicyInput {
	/** Mode from `delendai.config.json#plugins.test-policy.options.mode`. */
	readonly configMode?: ITestPolicyMode | undefined;
	/** Mode from the durable runtime override (set tool), when present. */
	readonly override?: ITestPolicyMode | undefined;
}

/** Precedence: override > config > default(`tdd`). */
export const resolveTestPolicy = (
	input: IResolveTestPolicyInput,
): IResolvedTestPolicy => {
	if (input.override !== undefined) {
		return { mode: input.override, source: 'override' };
	}
	if (input.configMode !== undefined) {
		return { mode: input.configMode, source: 'config' };
	}
	return { mode: 'tdd', source: 'default' };
};

/** Type guard for a raw string being a known mode. */
export const isTestPolicyMode = (value: unknown): value is ITestPolicyMode =>
	typeof value === 'string' &&
	(TEST_POLICY_MODES as readonly string[]).includes(value);
