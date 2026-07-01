/**
 * Canonical test convention for `@mcp-vertex/test-convention`.
 *
 * The plugin publishes one {@link ITestConvention} per workspace, built
 * from {@link DEFAULT_CONVENTION} + the host-provided overrides. Every
 * tool and every knowledge entry consumes this object so that the
 * defaults stay coherent.
 *
 * Conventions are project-scoped: defaults match the mcp-vertex
 * monorepo itself (vitest, colocated specs, `*.spec.ts`), but every
 * field is overridable from `mcp-vertex.config.json`.
 */

export type SpecLayout = 'colocate' | 'tests-mirror' | 'tests-flat';
export type MockStyle = 'vi' | 'jest' | 'auto';

export interface ICoverageThreshold {
	readonly lines: number;
	readonly functions: number;
	readonly branches: number;
	readonly statements: number;
}

export interface ITestConvention {
	/** File suffix for test specs (e.g. `spec.ts`). */
	readonly specExtension: string;
	/** Where specs live relative to the source file. */
	readonly specLayout: SpecLayout;
	/** Runners the project uses; drives mock hints. */
	readonly runners: readonly string[];
	/** Mock API the specs should use. `auto` → derive from `runners`. */
	readonly mockStyle: MockStyle;
	/** Every spec must be wrapped in a top-level `describe(...)`. */
	readonly requireDescribe: boolean;
	/** Minimum coverage thresholds (0-100). */
	readonly coverageThreshold: ICoverageThreshold;
	/** Patterns forbidden in any spec (case-insensitive). */
	readonly forbiddenPatterns: readonly RegExp[];
	/** Languages this convention applies to. */
	readonly languages: readonly string[];
}

export const DEFAULT_CONVENTION: ITestConvention = {
	specExtension: 'spec.ts',
	specLayout: 'colocate',
	runners: ['vitest'],
	mockStyle: 'auto',
	requireDescribe: true,
	coverageThreshold: {
		lines: 80,
		functions: 80,
		branches: 70,
		statements: 80,
	},
	forbiddenPatterns: [
		/\.only\(['"`]/, // describe.only / it.only / test.only
		/\bxit\(/, // skipped tests left behind
		/@ts-ignore/, // should be `@ts-expect-error` with a reason
		/\bconsole\.log\(/, // debug residue
	],
	languages: ['ts', 'tsx'],
};

export interface IConventionOverrides {
	specExtension?: string;
	specLayout?: SpecLayout;
	runners?: readonly string[];
	mockStyle?: MockStyle;
	requireDescribe?: boolean;
	coverageThreshold?: Partial<ICoverageThreshold>;
	/** Strings compiled into `RegExp` via `new RegExp(s, 'i')`. */
	forbiddenPatterns?: readonly string[];
	languages?: readonly string[];
}

/**
 * Merge overrides into {@link DEFAULT_CONVENTION}. `forbiddenPatterns`
 * is replaced (not appended) so the host can disable a default by
 * simply not listing it. `coverageThreshold` is merged per-field.
 */
export const mergeConvention = (
	overrides: IConventionOverrides = {},
): ITestConvention => ({
	...DEFAULT_CONVENTION,
	...overrides,
	coverageThreshold: {
		...DEFAULT_CONVENTION.coverageThreshold,
		...(overrides.coverageThreshold ?? {}),
	},
	forbiddenPatterns:
		overrides.forbiddenPatterns !== undefined
			? overrides.forbiddenPatterns.map((s) => new RegExp(s, 'i'))
			: DEFAULT_CONVENTION.forbiddenPatterns,
});

/**
 * Effective mock API given a convention: `auto` resolves to `vi` when
 * vitest is among the runners, otherwise `jest`.
 */
export const effectiveMockStyle = (c: ITestConvention): 'vi' | 'jest' => {
	if (c.mockStyle === 'vi' || c.mockStyle === 'jest') return c.mockStyle;
	return c.runners.includes('vitest') ? 'vi' : 'jest';
};
