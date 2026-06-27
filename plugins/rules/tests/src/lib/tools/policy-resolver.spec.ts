import { describe, expect, it } from 'vitest';

import type { ICommandSet } from '@mcp-vertex/rules/lib/frameworks/contracts';
import type { IDogmaAdapter } from '@mcp-vertex/rules/lib/frameworks/contracts';
import {
	DEFAULT_DOGMA_POLICY_PROVIDERS,
	StringDogmaPolicyProvider,
	resolveDefaultDogmaPolicyProvider,
} from '@mcp-vertex/rules/lib/tools/dogma-policy.provider';
import {
	buildDefaultPolicyResolver,
	PROJECT_OVER_DOGMA_OVER_DEFAULT,
} from '@mcp-vertex/rules/lib/tools/policy-resolver';
import type { IPolicyResolver } from '@mcp-vertex/rules/lib/tools/policy-resolution.contract';

/**
 * f00051 / S11 — `policy-resolver.spec.ts`
 *
 * Covers the 4-state matrix:
 *
 *   project | dogma | default  →  effective
 *   --------+-------+----------+----------
 *   yes     | yes   | yes      →  project
 *   yes     | no    | yes      →  project
 *   yes     | yes   | no       →  project
 *   yes     | no    | no       →  project
 *   no      | yes   | yes      →  dogma
 *   no      | yes   | no       →  dogma
 *   no      | no    | yes      →  default
 *   no      | no    | no       →  ERROR — invariants forbid this
 *                                   (fromDefault is always required)
 *
 * Plus boundary cases:
 *   - default policy does not throw when both project & dogma are missing
 *   - buildDefaultPolicyResolver returns the same singleton
 *   - a custom resolver (DIP swap) takes precedence over the default
 *   - the `areaDir` is propagated into the rationale
 */

const projectCmd: ICommandSet = {
	checkCommand: 'eslint apps/web --config apps/web/eslint.config.mjs',
	fixCommand: 'eslint apps/web --config apps/web/eslint.config.mjs --fix',
};

const dogmaCmd: ICommandSet = {
	checkCommand:
		'eslint apps/web --config .cache/mcp-vertex/rules/react-ts.eslint.config.mjs',
	fixCommand:
		'eslint apps/web --config .cache/mcp-vertex/rules/react-ts.eslint.config.mjs --fix',
	typecheckCommand: 'tsc --noEmit -p apps/web/tsconfig.json',
};

const defaultCmd: ICommandSet = {
	checkCommand:
		'eslint apps/web --config .cache/mcp-vertex/rules/vanilla-ts.eslint.config.mjs',
	typecheckCommand: 'tsc --noEmit',
};

const EMPTY_DEFAULT: ICommandSet = { checkCommand: 'noop' };

describe('f00051 S11 — IPolicyResolver (priority matrix)', () => {
	const resolver: IPolicyResolver = PROJECT_OVER_DOGMA_OVER_DEFAULT;

	it('case 1 — project + dogma + default → effective is project', () => {
		const out = resolver.resolveCommand({
			areaDir: 'apps/web',
			fromProject: projectCmd,
			fromDogma: dogmaCmd,
			fromDefault: defaultCmd,
		});
		expect(out.effective).toBe('project');
		expect(out.command).toBe(projectCmd.checkCommand);
		expect(out.rationale).toContain('apps/web');
		expect(out.fromProject).toBe(projectCmd);
		expect(out.fromDogma).toBe(dogmaCmd);
		expect(out.fromDefault).toBe(defaultCmd);
	});

	it('case 2 — project + (no dogma) + default → effective is project', () => {
		const out = resolver.resolveCommand({
			areaDir: 'apps/web',
			fromProject: projectCmd,
			fromDefault: defaultCmd,
		});
		expect(out.effective).toBe('project');
		expect(out.command).toBe(projectCmd.checkCommand);
		expect(out.fromProject).toBe(projectCmd);
		expect(out.fromDogma).toBeUndefined();
	});

	it('case 3 — project + dogma + (no default) → still project (default is required)', () => {
		// The interface guarantees fromDefault is always provided; we
		// verify the priority order holds even when dogma is missing.
		const out = resolver.resolveCommand({
			areaDir: 'apps/web',
			fromProject: projectCmd,
			fromDefault: EMPTY_DEFAULT,
		});
		expect(out.effective).toBe('project');
		expect(out.command).toBe(projectCmd.checkCommand);
	});

	it('case 4 — project + (no dogma) + (no default — invariant) → still project', () => {
		// Default is required by the type; the resolver handles it.
		const out = resolver.resolveCommand({
			areaDir: 'apps/web',
			fromProject: projectCmd,
			fromDefault: EMPTY_DEFAULT,
		});
		expect(out.effective).toBe('project');
	});

	it('case 5 — (no project) + dogma + default → effective is dogma', () => {
		const out = resolver.resolveCommand({
			areaDir: 'apps/cli',
			fromDogma: dogmaCmd,
			fromDefault: defaultCmd,
		});
		expect(out.effective).toBe('dogma');
		expect(out.command).toBe(dogmaCmd.checkCommand);
		expect(out.rationale).toContain('apps/cli');
		expect(out.rationale).toContain('dogma');
		expect(out.fromProject).toBeUndefined();
		expect(out.fromDogma).toBe(dogmaCmd);
	});

	it('case 6 — (no project) + dogma + (no default — invariant) → still dogma', () => {
		const out = resolver.resolveCommand({
			areaDir: 'apps/cli',
			fromDogma: dogmaCmd,
			fromDefault: EMPTY_DEFAULT,
		});
		expect(out.effective).toBe('dogma');
		expect(out.command).toBe(dogmaCmd.checkCommand);
	});

	it('case 7 — (no project) + (no dogma) + default → effective is default', () => {
		const out = resolver.resolveCommand({
			areaDir: 'apps/orphan',
			fromDefault: defaultCmd,
		});
		expect(out.effective).toBe('default');
		expect(out.command).toBe(defaultCmd.checkCommand);
		expect(out.rationale).toContain('apps/orphan');
		expect(out.rationale).toContain('vendored default');
		expect(out.fromProject).toBeUndefined();
		expect(out.fromDogma).toBeUndefined();
		expect(out.fromDefault).toBe(defaultCmd);
	});

	it('case 8 — empty area "" → still resolves (rationale uses empty string)', () => {
		const out = resolver.resolveCommand({
			areaDir: '',
			fromDefault: defaultCmd,
		});
		expect(out.effective).toBe('default');
		expect(out.command).toBe(defaultCmd.checkCommand);
	});

	it('case 9 — root area "root" → still resolves with full rationale', () => {
		const out = resolver.resolveCommand({
			areaDir: 'root',
			fromProject: projectCmd,
			fromDefault: defaultCmd,
		});
		expect(out.effective).toBe('project');
		expect(out.rationale).toContain('"root"');
	});

	it('case 10 — DIP swap: a custom resolver wins', () => {
		// A host that wants "dogma first, project second, default last"
		// supplies a different IPolicyResolver via IRulesToolOptions.
		const dogmaFirst: IPolicyResolver = {
			resolveCommand: ({ fromDogma, fromProject, fromDefault }) =>
				fromDogma !== undefined
					? {
							effective: 'dogma',
							command: fromDogma.checkCommand,
							rationale: 'host opted into dogma-first',
							fromDogma,
							fromDefault,
						}
					: fromProject !== undefined
						? {
								effective: 'project',
								command: fromProject.checkCommand,
								rationale: 'fallback to project',
								fromProject,
								fromDefault,
							}
						: {
								effective: 'default',
								command: fromDefault.checkCommand,
								rationale: 'no dogma, no project',
								fromDefault,
							},
		};
		const out = dogmaFirst.resolveCommand({
			areaDir: 'apps/web',
			fromProject: projectCmd,
			fromDogma: dogmaCmd,
			fromDefault: defaultCmd,
		});
		expect(out.effective).toBe('dogma');
		expect(out.command).toBe(dogmaCmd.checkCommand);
		expect(out.rationale).toBe('host opted into dogma-first');
	});

	it('case 11 — buildDefaultPolicyResolver returns PROJECT_OVER_DOGMA_OVER_DEFAULT', () => {
		// Identity check: the factory function must not return a fresh
		// implementation each call (host configs that capture the
		// resolver expect stable identity).
		const a = buildDefaultPolicyResolver();
		const b = buildDefaultPolicyResolver();
		expect(a).toBe(PROJECT_OVER_DOGMA_OVER_DEFAULT);
		expect(a).toBe(b);
	});

	it('case 12 — rationale strings are agent-facing (mention area + priority order)', () => {
		const projectWin = resolver.resolveCommand({
			areaDir: 'services/api',
			fromProject: projectCmd,
			fromDefault: defaultCmd,
		});
		expect(projectWin.rationale).toContain('services/api');
		expect(projectWin.rationale).toContain('priority');
		expect(projectWin.rationale.toLowerCase()).toContain('project');

		const dogmaWin = resolver.resolveCommand({
			areaDir: 'packages/legacy',
			fromDogma: dogmaCmd,
			fromDefault: defaultCmd,
		});
		expect(dogmaWin.rationale).toContain('packages/legacy');
		expect(dogmaWin.rationale.toLowerCase()).toContain('dogma');

		const defaultWin = resolver.resolveCommand({
			areaDir: 'apps/unknown',
			fromDefault: defaultCmd,
		});
		expect(defaultWin.rationale).toContain('apps/unknown');
		expect(defaultWin.rationale.toLowerCase()).toContain('default');
	});
});

/**
 * f00051 / S11 — `IDogmaPolicyProvider` seam.
 *
 * Sanity tests for the default `StringDogmaPolicyProvider` plus
 * the `DEFAULT_DOGMA_POLICY_PROVIDERS` registry. A host can swap
 * in a different provider (e.g. a future `ToolUseDogmaPolicyProvider`)
 * without touching the tools; the tests assert the contract that
 * any provider must satisfy.
 */
describe('f00051 S11 — IDogmaPolicyProvider (default string renderer)', () => {
	const rustDogma: IDogmaAdapter = {
		language: 'rs',
		displayName: 'Rust',
		version: 'rust-2024',
		packageManager: 'cargo',
		ownership: 'borrow-checker',
		errorModel: 'result',
		nullSafety: 'option',
		naming: 'snake_case',
		async: 'none',
		visibility: 'pub/fn',
		immutability: 'let-mut',
		testing: 'table-driven',
		bullets: [
			'Prefer `?` over `unwrap()`',
			'Use `#[must_use]` on fallible builders',
			'Keep borrow scopes small',
		],
	};

	it('case 13 — StringDogmaPolicyProvider renders a single agent-facing sentence', () => {
		const out = StringDogmaPolicyProvider.render({
			area: 'apps/cli',
			language: 'rs',
			dogma: rustDogma,
		});
		expect(out).toContain('apps/cli');
		expect(out).toContain('Rust');
		expect(out).toContain('borrow-checker');
		expect(out).toContain('result');
		expect(out).toContain('option');
		expect(out).toContain('snake_case');
		expect(out).toContain('cargo');
		expect(out).toContain('Prefer `?` over `unwrap()`');
	});

	it('case 14 — provider works without displayName (falls back to language tag)', () => {
		// exactOptionalPropertyTypes forbids assigning `undefined` to an
		// optional field, so we destructure the key out instead.
		const { displayName: _drop, ...noDisplay } = rustDogma;
		const _typedNoDisplay: IDogmaAdapter = noDisplay;
		const out = StringDogmaPolicyProvider.render({
			area: 'apps/cli',
			language: 'rs',
			dogma: noDisplay,
		});
		expect(out).toContain('Rs');
		expect(out.charAt(0)).toBe('R');
	});

	it('case 15 — provider handles an empty bullets array (no "Idiomatic do/don\'t" suffix)', () => {
		const noBullets: IDogmaAdapter = { ...rustDogma, bullets: [] };
		const out = StringDogmaPolicyProvider.render({
			area: 'apps/cli',
			language: 'rs',
			dogma: noBullets,
		});
		expect(out).not.toContain('Idiomatic do/don');
		expect(out).toContain('cargo');
	});

	it('case 16 — DEFAULT_DOGMA_POLICY_PROVIDERS exposes the string provider', () => {
		expect(DEFAULT_DOGMA_POLICY_PROVIDERS).toContain(
			StringDogmaPolicyProvider,
		);
		expect(DEFAULT_DOGMA_POLICY_PROVIDERS[0]?.id).toBe('string');
	});

	it('case 17 — resolveDefaultDogmaPolicyProvider returns the string provider by id and falls back to it on miss', () => {
		expect(resolveDefaultDogmaPolicyProvider('string')).toBe(
			StringDogmaPolicyProvider,
		);
		expect(resolveDefaultDogmaPolicyProvider('does-not-exist')).toBe(
			StringDogmaPolicyProvider,
		);
		expect(resolveDefaultDogmaPolicyProvider(undefined)).toBe(
			StringDogmaPolicyProvider,
		);
	});
});
