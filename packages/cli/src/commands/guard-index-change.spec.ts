/**
 * guard-index-change.spec.ts — an agent whose command changed the index
 * of the shared checkout is told so, in that command's own output.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	AGENT_ENVIRONMENT_MARKERS,
	DELENDAI_SESSION_VARIABLE,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { renderGuardBlock } from '@delendai/core/lib/guard-hooks/guard-hook-block.helper';

import { runHumanCli } from '../index';
import { indexWarning } from './guard.command';

const roots: string[] = [];

afterEach(() => {
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const policy = resolveDevelopmentPolicy({
	development: { profile: 'shared-checkout-pr' },
});

const facts = {
	branch: 'develop',
	inMainWorktree: true,
	staged: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
	followsIntegration: false,
};

describe('indexWarning', () => {
	it('says how many paths, where, and the one command that undoes it', () => {
		const warning = indexWarning(policy, facts);
		expect(warning).toContain('4 path(s) in the SHARED checkout');
		expect(warning).toContain('a.ts, b.ts, c.ts, …');
		expect(warning).toContain('delendai work rescue');
		expect(warning).toContain('delendai work enter');
	});

	it('says nothing in a linked worktree, on another branch or with nothing staged', () => {
		expect(indexWarning(policy, { ...facts, inMainWorktree: false })).toBe(
			'',
		);
		expect(indexWarning(policy, { ...facts, branch: 'feature' })).toBe('');
		expect(indexWarning(policy, { ...facts, staged: [] })).toBe('');
	});

	it('says nothing while the index is only following the integration branch', () => {
		// A fast-forward writes the index before it moves the branch.
		expect(
			indexWarning(policy, { ...facts, followsIntegration: true }),
		).toBe('');
	});

	it('says nothing under a profile that does not pin the checkout', () => {
		const free = resolveDevelopmentPolicy({
			development: { profile: 'trunk' },
		});
		expect(
			free.workspace.pinnedCheckout ? '' : indexWarning(free, facts),
		).toBe('');
	});
});

/** A checkout on develop, under the pinned profile, with one path staged. */
const dirtyCheckout = (guard = ''): string => {
	const root = mkdtempSync(join(tmpdir(), 'guard-index-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'index@example.com');
	git('config', 'user.name', 'Index');
	writeFileSync(
		join(root, 'delendai.config.json'),
		`{ "development": { "profile": "shared-checkout-pr"${guard} } }`,
	);
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	writeFileSync(join(root, 'landed-here.ts'), 'export {};\n');
	git('add', 'landed-here.ts');
	return root;
};

/** No variable that names an agent, a host or a session: an unidentified actor. */
const asNobodyInParticular = (): void => {
	for (const name of [
		...AGENT_ENVIRONMENT_MARKERS,
		DELENDAI_SESSION_VARIABLE,
	]) {
		vi.stubEnv(name, '');
	}
	for (const name of Object.keys(process.env)) {
		if (name.startsWith('CODEX_') || name.startsWith('CURSOR_')) {
			vi.stubEnv(name, '');
		}
	}
	vi.stubEnv('CI', '');
};

const guardSays = async (root: string): Promise<string> => {
	const said: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string) => {
		said.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
	try {
		const code = await runHumanCli(
			['guard', 'post-index-change', `--workspace=${root}`],
			root,
		);
		// It tells; it never fails the command that already ran.
		expect(code).toBe(0);
	} finally {
		process.stderr.write = original;
	}
	return said.join('');
};

describe('delendai guard post-index-change, through the CLI entry', () => {
	it('tells an agent that its command staged a path in the shared checkout', async () => {
		vi.stubEnv('AI_AGENT', 'guard-index-spec_1_agent');
		const said = await guardSays(dirtyCheckout());
		expect(said).toContain('1 path(s) in the SHARED checkout');
		expect(said).toContain('landed-here.ts');
		expect(said).toContain('delendai work rescue');
	});

	it('speaks to an actor it cannot identify, which a pinned checkout takes for an agent', async () => {
		asNobodyInParticular();
		expect(await guardSays(dirtyCheckout())).toContain('SHARED checkout');
	});

	it('says nothing to a person, in a project that says unidentified actors are people', async () => {
		asNobodyInParticular();
		expect(
			await guardSays(
				dirtyCheckout(', "guard": { "unknownActor": "person" }'),
			),
		).toBe('');
	});
});

describe('the post-index-change hook block', () => {
	const block = renderGuardBlock('post-index-change', {
		runner: 'bun',
		entry: 'packages/cli/src/index.ts',
	});

	it('asks the guard only in the shared checkout, and only when the index left HEAD', () => {
		expect(block).toContain('--git-common-dir');
		expect(block).toContain('! git diff --cached --quiet');
		expect(block).toContain('guard post-index-change');
	});

	it('cannot be re-entered by the git calls the guard makes itself', () => {
		expect(block).toContain('[ -z "${DELENDAI_INDEX_GUARD:-}" ]');
		expect(block).toContain('export DELENDAI_INDEX_GUARD');
	});

	it('never fails the git command that wrote the index', () => {
		expect(block).not.toContain('exit 1');
	});
});
