/**
 * anchor.spec.ts — the shared checkout must stay on the branch the whole
 * workspace is built on, and a checkpoint made from anywhere else is
 * refused before it exists.
 *
 * This spec exists because of a real failure, not a hypothetical one. An
 * agent switched the shared checkout to a feature branch and then drove
 * the WIP engine correctly. Every existing guarantee held — HEAD was not
 * moved, the private index was used, the scope was exact — and the work
 * was still wrong, because it was durable work built on a base no other
 * agent shared. Nothing was responsible for the question "which branch
 * should this be?", so nothing complained.
 *
 * Nothing here spells `develop` except through configuration. An
 * invariant written against a literal branch name silently stops holding
 * for the project that integrates on something else, and that project is
 * precisely the one being onboarded.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	anchorFromPolicy,
	anchorRefusal,
	createWipEngine,
	observeAnchor,
	UNANCHORED,
	type IWipEngine,
} from '@delendai/core/lib/wip-engine/index';
import { createScopedGitRunner } from '@delendai/core/lib/wip-engine/git-command';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import {
	createWipTestRepo,
	headState,
	INTEGRATION_BRANCH,
	type IWipTestRepo,
} from './wip-repo';

const REF = 'refs/wip/agent-a/f1-s1-g1';

const policyFor = (integration: string) =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { integration },
			integration: { requiredChecks: ['delendai-validate'] },
		},
	});

describe('the integration-branch anchor', () => {
	let repo: IWipTestRepo;
	let base: string;

	beforeEach(() => {
		repo = createWipTestRepo();
		repo.write('src/alpha.ts', 'export const alpha = 1;\n');
		base = repo.commitAll('base');
	});

	afterEach(() => {
		repo.cleanup();
	});

	const engineOn = async (integration: string): Promise<IWipEngine> => {
		const engine = await createWipEngine(
			repo.dir,
			anchorFromPolicy(policyFor(integration)),
		);
		if (engine === undefined) throw new Error('no engine');
		return engine;
	};

	const checkpoint = async (engine: IWipEngine) =>
		engine.createOrUpdateWipRef({
			ref: REF,
			baseSha: base,
			paths: ['src/alpha.ts'],
			message: 'wip',
		});

	it('checkpoints normally when the checkout is where it belongs', async () => {
		const result = await checkpoint(await engineOn(INTEGRATION_BRANCH));
		expect(result.status).toBe('created');
	});

	it('refuses to build a checkpoint from a feature branch', async () => {
		repo.git('switch', '--quiet', '--create', 'feat/somewhere-else');
		const result = await checkpoint(await engineOn(INTEGRATION_BRANCH));

		expect(result.status).toBe('failed');
		// The refusal has to be actionable: an agent told only "wrong
		// branch" is an agent about to invent a recovery.
		expect(result.reason).toContain('feat/somewhere-else');
		expect(result.reason).toContain(INTEGRATION_BRANCH);
		expect(result.reason).toContain('Agents own work, not branches');
	});

	it('leaves no ref behind when it refuses', async () => {
		// A partial checkpoint would be worse than none: the next agent
		// would find a ref whose scope nobody recorded.
		repo.git('switch', '--quiet', '--create', 'feat/somewhere-else');
		await checkpoint(await engineOn(INTEGRATION_BRANCH));
		expect(() => repo.git('rev-parse', '--verify', REF)).toThrow();
	});

	it('anchors to the branch the project configured, not to a literal', async () => {
		repo.git('switch', '--quiet', '--create', 'next');
		const result = await checkpoint(await engineOn('next'));

		expect(result.status).toBe('created');
		// And the same tree is a violation for a project anchored
		// elsewhere — the branch is not special, the configuration is.
		expect((await checkpoint(await engineOn('trunk'))).status).toBe(
			'failed',
		);
	});

	it('refuses a detached HEAD, which belongs to no branch at all', async () => {
		repo.git('checkout', '--quiet', '--detach', base);
		const result = await checkpoint(await engineOn(INTEGRATION_BRANCH));

		expect(result.status).toBe('failed');
		expect(result.reason).toContain('detached');
	});

	it('does not move HEAD, whether it accepts or refuses', async () => {
		const before = headState(repo);
		await checkpoint(await engineOn(INTEGRATION_BRANCH));
		expect(headState(repo)).toEqual(before);

		repo.git('switch', '--quiet', '--create', 'feat/x');
		const onFeature = headState(repo);
		await checkpoint(await engineOn(INTEGRATION_BRANCH));
		// Refusing is not a licence to "fix" the checkout underneath the
		// operator: the engine reports, the operator decides.
		expect(headState(repo)).toEqual(onFeature);
	});

	it('checks nothing when the policy anchors nothing', async () => {
		// The worktree model owns its branch by design, so the same code
		// path must stay silent there rather than being disabled by a
		// caller remembering to skip it.
		repo.git('switch', '--quiet', '--create', 'agent/whatever');
		const engine = await createWipEngine(repo.dir, UNANCHORED);
		if (engine === undefined) throw new Error('no engine');
		expect((await checkpoint(engine)).status).toBe('created');
	});
});

describe('anchor verdicts', () => {
	let repo: IWipTestRepo;

	beforeEach(() => {
		repo = createWipTestRepo();
		repo.write('a.ts', 'export const a = 1;\n');
		repo.commitAll('base');
	});

	afterEach(() => {
		repo.cleanup();
	});

	it('distinguishes anchored, wrong-branch and detached', async () => {
		const run = createScopedGitRunner(repo.dir);
		const requirement = { required: true, branch: INTEGRATION_BRANCH };

		expect(await observeAnchor(run, requirement)).toEqual({
			kind: 'anchored',
			branch: INTEGRATION_BRANCH,
		});

		repo.git('switch', '--quiet', '--create', 'other');
		expect(await observeAnchor(run, requirement)).toEqual({
			kind: 'wrong-branch',
			expected: INTEGRATION_BRANCH,
			actual: 'other',
		});

		repo.git('checkout', '--quiet', '--detach');
		expect((await observeAnchor(run, requirement)).kind).toBe('detached');
	});

	it('never reports an unverifiable checkout as anchored', async () => {
		// "We could not tell" is not "it is fine". Treating it as a pass
		// would fabricate the guarantee the check exists to prove.
		const verdict = await observeAnchor(createScopedGitRunner(repo.dir), {
			required: true,
			branch: '',
		});
		expect(verdict.kind).toBe('unreadable');
		expect(anchorRefusal(verdict)).toContain('not an anchor');
	});
});
