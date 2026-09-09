/**
 * checkpoint.spec.ts — the invariants that make the WIP engine safe to
 * point at a SHARED working tree, each asserted against a real git
 * repository rather than a mocked runner.
 *
 * Every test here corresponds to a way the naive implementation
 * (`git add . && git commit`) destroys another agent's work: it captures
 * their edits, it moves HEAD, or it leaves the shared `.git/index`
 * half-staged when it fails. The assertions are deliberately blunt —
 * byte-compare the index, byte-compare HEAD — because a subtler check
 * would pass for an engine that is only accidentally correct.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createWipEngine,
	type IWipEngine,
} from '@delendai/core/lib/wip-engine/index';

import {
	changedPaths,
	createWipTestRepo,
	headState,
	INTEGRATION_BRANCH,
	treePaths,
	type IWipTestRepo,
} from './wip-repo';

const AGENT_A_REF = 'refs/wip/agent-a/f1-s1-g1';
const AGENT_B_REF = 'refs/wip/agent-b/f1-s2-g1';

describe('createOrUpdateWipRef', () => {
	let repo: IWipTestRepo;
	let engine: IWipEngine;
	let base: string;

	beforeEach(async () => {
		repo = createWipTestRepo();
		repo.write('src/alpha.ts', 'export const alpha = 1;\n');
		repo.write('src/beta.ts', 'export const beta = 1;\n');
		repo.write('docs/readme.md', '# docs\n');
		base = repo.commitAll('base');
		const created = await createWipEngine(repo.dir);
		expect(created).toBeDefined();
		engine = created as IWipEngine;
	});

	afterEach(() => {
		repo.cleanup();
	});

	it('captures only the claimed paths when two agents share one tree', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		repo.write('src/beta.ts', 'export const beta = 2;\n');

		const a = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: agent a',
		});
		const b = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/beta.ts'],
			ref: AGENT_B_REF,
			message: 'wip: agent b',
		});

		expect(a.status).toBe('created');
		expect(b.status).toBe('created');
		expect(changedPaths(repo, a.commit)).toEqual(['src/alpha.ts']);
		expect(changedPaths(repo, b.commit)).toEqual(['src/beta.ts']);
		// Agent A's checkpoint still carries agent B's BASE content, not
		// B's dirty edit: exact scope, not a snapshot of the tree.
		expect(repo.git('show', `${a.commit}:src/beta.ts`)).toBe(
			'export const beta = 1;',
		);
	});

	it('never captures a foreign dirty file, tracked or untracked', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		repo.write('docs/readme.md', '# someone else was here\n');
		repo.write('scratch/foreign.txt', 'another agent is mid-edit\n');

		const result = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: agent a',
		});

		expect(result.status).toBe('created');
		expect(changedPaths(repo, result.commit)).toEqual(['src/alpha.ts']);
		expect(treePaths(repo, result.commit)).not.toContain(
			'scratch/foreign.txt',
		);
		expect(repo.git('show', `${result.commit}:docs/readme.md`)).toBe(
			'# docs',
		);
		// The foreign edits are still sitting in the working tree, untouched.
		expect(repo.read('scratch/foreign.txt')).toBe(
			'another agent is mid-edit\n',
		);
		expect(repo.read('docs/readme.md')).toBe('# someone else was here\n');
	});

	it('leaves .git/index byte-identical', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		repo.write('scratch/foreign.txt', 'dirty\n');
		const before = repo.indexBytes();

		const result = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: agent a',
		});

		expect(result.status).toBe('created');
		expect(repo.indexBytes().equals(before)).toBe(true);
		// And the real index still knows nothing about a staged change.
		expect(repo.git('diff', '--cached', '--name-only')).toBe('');
	});

	it('leaves HEAD and the current branch exactly where they were', async () => {
		const before = headState(repo);
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');

		await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: agent a',
		});

		expect(headState(repo)).toEqual(before);
		expect(headState(repo).branch).toBe(INTEGRATION_BRANCH);
		// A WIP ref is not a branch: it must never become a checkout target.
		expect(repo.git('branch', '--list', '--format=%(refname:short)')).toBe(
			INTEGRATION_BRANCH,
		);
	});

	it('captures a deletion inside the claimed scope', async () => {
		repo.write('src/nested/gamma.ts', 'export const gamma = 1;\n');
		const withGamma = repo.commitAll('add gamma');
		repo.git('rm', '--quiet', '--', 'src/nested/gamma.ts');
		// `git rm` stages, which is not how an agent deletes a file — undo
		// the staging so only the working tree reflects the deletion.
		repo.git('reset', '--quiet', '--', 'src/nested/gamma.ts');

		const result = await engine.createOrUpdateWipRef({
			baseSha: withGamma,
			paths: ['src/nested'],
			ref: AGENT_A_REF,
			message: 'wip: delete gamma',
		});

		expect(result.status).toBe('created');
		expect(changedPaths(repo, result.commit)).toEqual([
			'src/nested/gamma.ts',
		]);
		expect(treePaths(repo, result.commit)).not.toContain(
			'src/nested/gamma.ts',
		);
	});

	it('is idempotent: an unchanged scope keeps its digest and its commit', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		const first = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: agent a',
		});
		// A foreign agent dirties the tree between the two checkpoints.
		repo.write('src/beta.ts', 'export const beta = 99;\n');

		const second = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: agent a',
		});

		expect(second.status).toBe('unchanged');
		expect(second.patchDigest).toBe(first.patchDigest);
		expect(second.commit).toBe(first.commit);
		expect(repo.git('rev-list', '--count', AGENT_A_REF)).toBe('2');
	});

	it('advances the ref and changes the digest when the scope changes', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		const first = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: one',
		});
		repo.write('src/alpha.ts', 'export const alpha = 3;\n');
		const second = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: two',
		});

		expect(second.status).toBe('created');
		expect(second.patchDigest).not.toBe(first.patchDigest);
		expect(second.parent).toBe(first.commit);
		expect(repo.git('rev-parse', AGENT_A_REF)).toBe(second.commit);
	});

	it('refuses a narrowed scope instead of dropping checkpointed work', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		repo.write('src/beta.ts', 'export const beta = 2;\n');
		const wide = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts', 'src/beta.ts'],
			ref: AGENT_A_REF,
			message: 'wip: both files',
		});
		expect(wide.status).toBe('created');

		const narrowed = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: only alpha',
		});

		expect(narrowed.status).toBe('scope-narrowed');
		expect(narrowed.dropped).toEqual(['src/beta.ts']);
		expect(narrowed.reason).toContain('src/beta.ts');
		// The ref did not move, and the work that would have been dropped
		// is still reachable from it — nothing was lost by refusing.
		expect(repo.git('rev-parse', AGENT_A_REF)).toBe(wide.commit);
		expect(repo.git('show', `${AGENT_A_REF}:src/beta.ts`)).toBe(
			'export const beta = 2;',
		);
	});

	it('narrows the scope when the caller opts in', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		repo.write('src/beta.ts', 'export const beta = 2;\n');
		const wide = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts', 'src/beta.ts'],
			ref: AGENT_A_REF,
			message: 'wip: both files',
		});

		const released = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: release beta',
			allowScopeNarrowing: true,
		});

		expect(released.status).toBe('created');
		expect(released.dropped).toEqual([]);
		expect(released.parent).toBe(wide.commit);
		expect(repo.git('rev-parse', AGENT_A_REF)).toBe(released.commit);
		// beta is back to its base content in the ref: released, deliberately.
		expect(repo.git('show', `${AGENT_A_REF}:src/beta.ts`)).toBe(
			'export const beta = 1;',
		);
	});

	it('accepts a widened scope without any opt-in', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		const first = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: alpha',
		});
		repo.write('src/beta.ts', 'export const beta = 2;\n');

		const widened = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts', 'src/beta.ts'],
			ref: AGENT_A_REF,
			message: 'wip: alpha and beta',
		});

		expect(widened.status).toBe('created');
		expect(widened.dropped).toEqual([]);
		expect(widened.parent).toBe(first.commit);
		expect(changedPaths(repo, widened.commit)).toEqual(['src/beta.ts']);
		expect(repo.git('show', `${AGENT_A_REF}:src/alpha.ts`)).toBe(
			'export const alpha = 2;',
		);
	});

	it('does not read a deletion inside a claimed directory as narrowing', async () => {
		repo.write('src/nested/one.ts', 'export const one = 1;\n');
		repo.write('src/nested/two.ts', 'export const two = 1;\n');
		const withNested = repo.commitAll('add nested');
		repo.write('src/nested/one.ts', 'export const one = 2;\n');
		const first = await engine.createOrUpdateWipRef({
			baseSha: withNested,
			paths: ['src/nested'],
			ref: AGENT_A_REF,
			message: 'wip: nested',
		});
		expect(first.status).toBe('created');
		expect(first.scope).toContain('src/nested/two.ts');

		rmSync(join(repo.dir, 'src/nested/two.ts'));
		const second = await engine.createOrUpdateWipRef({
			baseSha: withNested,
			paths: ['src/nested'],
			ref: AGENT_A_REF,
			message: 'wip: nested minus two',
		});

		// The claim is unchanged, so deleting a file inside it is work, not
		// a narrowing — the guard must not fire.
		expect(second.status).toBe('created');
		expect(second.dropped).toEqual([]);
		expect(changedPaths(repo, second.commit)).toEqual([
			'src/nested/two.ts',
		]);
	});

	it('records the scope on the commit and stamps the requested author', async () => {
		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		const result = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts'],
			ref: AGENT_A_REF,
			message: 'wip: agent a',
			author: { name: 'Agent A', email: 'agent-a@delendai.test' },
		});

		expect(result.scope).toEqual(['src/alpha.ts']);
		expect(repo.git('log', '-1', '--format=%an <%ae>', AGENT_A_REF)).toBe(
			'Agent A <agent-a@delendai.test>',
		);
		expect(repo.git('log', '-1', '--format=%B', AGENT_A_REF)).toContain(
			'Delendai-Wip-Scope: src/alpha.ts',
		);
	});

	it('refuses a claim that escapes the repository, without running git', async () => {
		const result = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['../outside.txt', '.git/config'],
			ref: AGENT_A_REF,
			message: 'wip: nope',
		});

		expect(result.status).toBe('failed');
		expect(result.reason).toContain('escapes the repository');
		expect(
			repo.git('for-each-ref', '--format=%(refname)', 'refs/wip'),
		).toBe('');
	});
});
