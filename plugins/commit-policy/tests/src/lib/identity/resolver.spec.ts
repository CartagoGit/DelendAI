/**
 * resolver.spec.ts — exhaustive coverage for every `ICommitPolicyIdentity`
 * mode, plus failure paths.
 *
 * Uses an in-memory fake `IGitRunner` (mirrors the contract from
 * `packages/core/src/lib/contracts/interfaces/git-runner.interface.ts`)
 * so the suite is fully offline + deterministic.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import type { ICommitPolicyIdentity } from '@delendai/commit-policy/lib/contracts/options';
import { resolveAuthor } from '@delendai/commit-policy/lib/identity/resolver';

/**
 * Tiny in-memory git runner. Keys are the args joined with NUL so
 * `config --global user.name` and `config --global user.email` are
 * distinguishable; the response is whatever the user wired up.
 */
const buildFakeGitRunner = (
	responses: ReadonlyMap<string, IGitRunResult>,
	// Optional dynamic resolver for keys not present in `responses`.
	dynamic?: (args: readonly string[]) => IGitRunResult,
): IGitRunner => {
	const handler = (args: readonly string[]): Promise<IGitRunResult> => {
		const key = args.join('\u0000');
		const direct = responses.get(key);
		if (direct !== undefined) return Promise.resolve(direct);
		if (dynamic !== undefined) return Promise.resolve(dynamic(args));
		return Promise.resolve({
			ok: false,
			output: '',
			reason: 'not stubbed',
		});
	};
	return handler as IGitRunner;
};

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const noEnv: Readonly<Record<string, string | undefined>> = Object.freeze({});

describe('resolveAuthor', () => {
	describe('mode=explicit', () => {
		const identity: ICommitPolicyIdentity = {
			mode: 'explicit',
			owner: { name: 'Cartago', email: 'cartago@example.com' },
		};

		it('returns the supplied owner verbatim', async () => {
			const result = await resolveAuthor(identity, {
				run: buildFakeGitRunner(new Map()),
				envVars: noEnv,
			});
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.authorFlag).toBe(
				'Cartago <cartago@example.com>',
			);
			expect(result.author.label).toBe('explicit owner');
		});

		it('refuses when the owner name is whitespace', async () => {
			const result = await resolveAuthor(
				{
					mode: 'explicit',
					owner: { name: '   ', email: 'x@example.com' },
				},
				{ run: buildFakeGitRunner(new Map()), envVars: noEnv },
			);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.reason).toContain('user.name');
		});

		it('refuses when the owner email is empty', async () => {
			const result = await resolveAuthor(
				{ mode: 'explicit', owner: { name: 'Cartago', email: '' } },
				{ run: buildFakeGitRunner(new Map()), envVars: noEnv },
			);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.reason).toContain('user.email');
		});
	});

	describe('mode=global', () => {
		it('returns the global user.name + user.email from git config', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				[
					'config\u0000--global\u0000user.email',
					ok('cartago@example.com\n'),
				],
			]);
			const result = await resolveAuthor(
				{ mode: 'global' },
				{ run: buildFakeGitRunner(responses), envVars: noEnv },
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.displayName).toBe('Cartago');
			expect(result.author.email).toBe('cartago@example.com');
			expect(result.author.label).toBe('global git config');
		});

		it('refuses when neither global config is set', async () => {
			const result = await resolveAuthor(
				{ mode: 'global' },
				{
					run: buildFakeGitRunner(new Map()),
					envVars: noEnv,
				},
			);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.reason).toContain('global');
		});

		it('refuses when only one of name/email is set', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				['config\u0000--global\u0000user.email', fail('unset')],
			]);
			const result = await resolveAuthor(
				{ mode: 'global' },
				{ run: buildFakeGitRunner(responses), envVars: noEnv },
			);
			expect(result.ok).toBe(false);
		});
	});

	describe('mode=repo', () => {
		it('returns repo-local identity when set', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000user.name', ok('Repo Bot\n')],
				['config\u0000user.email', ok('repo@example.com\n')],
			]);
			const result = await resolveAuthor(
				{ mode: 'repo' },
				{ run: buildFakeGitRunner(responses), envVars: noEnv },
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.displayName).toBe('Repo Bot');
		});

		it('falls back to global when repo-local is missing', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000user.name', fail('unset')],
				['config\u0000user.email', fail('unset')],
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				[
					'config\u0000--global\u0000user.email',
					ok('cartago@example.com\n'),
				],
			]);
			const result = await resolveAuthor(
				{ mode: 'repo' },
				{ run: buildFakeGitRunner(responses), envVars: noEnv },
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.label).toBe('repo + global fallback');
			expect(result.author.displayName).toBe('Cartago');
		});

		it('refuses when neither repo nor global is set', async () => {
			const result = await resolveAuthor(
				{ mode: 'repo' },
				{ run: buildFakeGitRunner(new Map()), envVars: noEnv },
			);
			expect(result.ok).toBe(false);
		});
	});

	describe('mode=env', () => {
		it('returns GIT_AUTHOR_NAME + GIT_AUTHOR_EMAIL', async () => {
			const result = await resolveAuthor(
				{ mode: 'env' },
				{
					run: buildFakeGitRunner(new Map()),
					envVars: {
						GIT_AUTHOR_NAME: 'Cartago',
						GIT_AUTHOR_EMAIL: 'cartago@example.com',
					},
				},
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.authorFlag).toBe(
				'Cartago <cartago@example.com>',
			);
			expect(result.author.label).toBe('GIT_AUTHOR_* env');
		});

		it('refuses when GIT_AUTHOR_NAME is missing', async () => {
			const result = await resolveAuthor(
				{ mode: 'env' },
				{
					run: buildFakeGitRunner(new Map()),
					envVars: { GIT_AUTHOR_EMAIL: 'x@y.z' },
				},
			);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.reason).toContain('GIT_AUTHOR_NAME');
		});

		it('refuses when GIT_AUTHOR_EMAIL is missing', async () => {
			const result = await resolveAuthor(
				{ mode: 'env' },
				{
					run: buildFakeGitRunner(new Map()),
					envVars: { GIT_AUTHOR_NAME: 'Cartago' },
				},
			);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.reason).toContain('GIT_AUTHOR_EMAIL');
		});
	});

	describe('mode=agent', () => {
		it('uses host identity when present', async () => {
			const result = await resolveAuthor(
				{ mode: 'agent' },
				{
					run: buildFakeGitRunner(new Map()),
					envVars: noEnv,
					hostIdentity: {
						host: 'vscode-copilot',
						model: 'minimax-m3',
					},
				},
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.displayName).toBe('vscode-copilot');
			expect(result.author.email).toBe('minimax-m3@vscode-copilot');
			expect(result.author.label).toBe('agent (host identity)');
		});

		it('falls back to explicit fallbacks when host identity is absent', async () => {
			const result = await resolveAuthor(
				{
					mode: 'agent',
					fallbackName: 'Cartago',
					fallbackEmail: 'cartago@example.com',
				},
				{ run: buildFakeGitRunner(new Map()), envVars: noEnv },
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.displayName).toBe('Cartago');
		});

		it('falls back to global git config when nothing else is wired', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				[
					'config\u0000--global\u0000user.email',
					ok('cartago@example.com\n'),
				],
			]);
			const result = await resolveAuthor(
				{ mode: 'agent' },
				{ run: buildFakeGitRunner(responses), envVars: noEnv },
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.label).toBe('agent (host identity)');
			expect(result.author.displayName).toBe('Cartago');
		});
	});

	describe('mode=auto', () => {
		it('prefers env over global over repo over agent', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000user.name', ok('Repo Bot\n')],
				['config\u0000user.email', ok('repo@example.com\n')],
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				[
					'config\u0000--global\u0000user.email',
					ok('cartago@example.com\n'),
				],
			]);
			const result = await resolveAuthor(
				{ mode: 'auto' },
				{
					run: buildFakeGitRunner(responses),
					envVars: {
						GIT_AUTHOR_NAME: 'Env Bot',
						GIT_AUTHOR_EMAIL: 'env@example.com',
					},
				},
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.label).toBe('auto → env');
		});

		it('falls back to global when env is partial', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000--global\u0000user.name', ok('Cartago\n')],
				[
					'config\u0000--global\u0000user.email',
					ok('cartago@example.com\n'),
				],
			]);
			const result = await resolveAuthor(
				{ mode: 'auto' },
				{
					run: buildFakeGitRunner(responses),
					envVars: { GIT_AUTHOR_NAME: 'Env Only' },
				},
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.label).toBe('auto → global');
		});

		it('falls back to repo when neither env nor global is set', async () => {
			const responses = new Map<string, IGitRunResult>([
				['config\u0000user.name', ok('Repo Bot\n')],
				['config\u0000user.email', ok('repo@example.com\n')],
				['config\u0000--global\u0000user.name', fail('unset')],
				['config\u0000--global\u0000user.email', fail('unset')],
			]);
			const result = await resolveAuthor(
				{ mode: 'auto' },
				{ run: buildFakeGitRunner(responses), envVars: noEnv },
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.label).toBe('auto → repo');
		});

		it('falls back to agent when nothing else is set', async () => {
			const result = await resolveAuthor(
				{ mode: 'auto' },
				{
					run: buildFakeGitRunner(new Map()),
					envVars: noEnv,
					hostIdentity: {
						host: 'vscode-copilot',
						model: 'minimax-m3',
					},
				},
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.author.label).toBe('auto → agent');
		});

		it('refuses when nothing resolves', async () => {
			const result = await resolveAuthor(
				{ mode: 'auto' },
				{ run: buildFakeGitRunner(new Map()), envVars: noEnv },
			);
			expect(result.ok).toBe(false);
		});
	});
});
