/**
 * work-unit-publish.service.spec.ts — what `published` refuses before it
 * touches git or the forge, and the generation fence that reads a unit's
 * name in either spelling (f00808). Pure: git is faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const state = vi.hoisted(() => {
	const initial: {
		policy: object | undefined;
		workRef: string;
		taken: { generation: number; ref: string } | undefined;
		base: string | undefined;
	} = {
		policy: undefined,
		workRef: 'refs/heads/delendai/wip/a/implement/x00001-S1-g1/t',
		taken: undefined,
		base: 'abc',
	};
	return initial;
});

vi.mock(
	'@delendai/core/lib/work-units/work-unit-shared.service',
	async (importOriginal) => ({
		...(await importOriginal<object>()),
		openWork: () => ({ engine: {}, policy: state.policy, root: '/r' }),
		mainWorktreeOf: (cwd: string) => cwd,
		integrationBase: () => state.base,
		integrationRemote: () => 'origin',
		readGit: () => undefined,
	}),
);
vi.mock('@delendai/core/lib/work-units/work-unit-generation.service', () => ({
	ambiguousUnit: () => undefined,
	existingWorkRef: () => state.workRef,
}));
vi.mock('@delendai/core/lib/work-units/unit-fence.service', () => ({
	readSupersedingUnit: () => state.taken,
}));

const { published } = await import(
	'@delendai/core/lib/work-units/work-unit-publish.service'
);

const policyFor = (profile: string) =>
	resolveDevelopmentPolicy({
		development: {
			profile,
			branches: { namespacePrefix: 'delendai' },
		},
	});

const ctx = fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
	cwd: '/r',
	globals: fakePartial<IWorkUnitContext['globals'], 'remote'>({
		remote: 'nowhere',
	}),
});

const UNIT = ['--proposal=x00001', '--slice=S1', '--agent=claude-opus-5'];

describe('published', () => {
	beforeEach(() => {
		state.policy = policyFor('shared-checkout-pr');
		state.workRef = 'refs/heads/delendai/wip/a/implement/x00001-S1-g1/t';
		state.taken = undefined;
		state.base = 'abc';
	});

	it('[<200ms] names the arguments it needs', async () => {
		expect((await published(['--slice=S1'], ctx)).code).not.toBe(0);
	});

	it('[<200ms] does not take a separate name for the publication', async () => {
		const result = await published([...UNIT, '--as=x'], ctx);
		expect(result.error).toContain('is not named separately');
	});

	it('[<200ms] has nothing to publish under a profile without work refs', async () => {
		const policy = policyFor('shared-direct');
		state.policy = {
			...policy,
			branches: { ...policy.branches, workRefTemplate: '' },
		};
		const result = await published(UNIT, ctx);
		expect(result.error).toContain('has no work-ref model');
	});

	it('[<200ms] refuses an unknown kind', async () => {
		const result = await published([...UNIT, '--kind=bogus'], ctx);
		expect(result.code).not.toBe(0);
	});

	it('[<200ms] refuses a ref outside the work namespace', async () => {
		state.workRef = 'refs/heads/elsewhere/x';
		const result = await published(UNIT, ctx);
		expect(result.error).toContain('is not under this policy');
	});

	it('[<200ms] refuses a unit another generation has taken over', async () => {
		state.taken = { generation: 2, ref: 'refs/heads/x-g2' };
		const result = await published(UNIT, ctx);
		expect(result.error).toContain('was taken over: generation 2');
	});

	it('[<200ms] refuses when the integration branch resolves to nothing', async () => {
		state.base = undefined;
		const result = await published(UNIT, ctx);
		expect(result.error).toContain('resolves to no commit');
	});
});
