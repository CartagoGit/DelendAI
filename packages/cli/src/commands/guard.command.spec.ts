/**
 * guard.command.spec.ts — git itself refuses what the policy forbids.
 *
 * The end-to-end case installs real hooks that call the real CLI, then
 * runs the operations an adopter project's agent ran by hand on
 * `shared-checkout-merge`: a commit on `develop` and an `agent/*`
 * branch. They must fail from a plain shell, while delendai's own work
 * branch, a merge into `develop`, and every operation in a project with
 * no declared policy still succeed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import type { IGuardFacts } from '../contracts/interfaces/guard.interface';
import {
	checkoutWarning,
	createGuardCommand,
	defaultGuardFacts,
	operationsForHook,
} from './guard.command';

/**
 * The guard governs agents; a person is never refused (x00626). Every case
 * in this file describes what an agent is told, so the environment says an
 * agent is running git, for this process and the git hooks it spawns. It
 * used to be inherited from whoever ran the suite: an agent's shell passed
 * and CI's did not.
 */
beforeEach(() => {
	vi.stubEnv('AI_AGENT', 'guard-spec_1_agent');
});
afterEach(() => {
	vi.unstubAllEnvs();
});

const ZERO = '0000000000000000000000000000000000000000';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('operationsForHook', () => {
	it('pre-commit asks about the branch being committed to', () => {
		expect(
			operationsForHook('pre-commit', [], '', {
				branch: 'develop',
				isMerge: false,
			}),
		).toEqual([
			{
				kind: 'commit',
				branch: 'develop',
				isMerge: false,
				inMainWorktree: true,
			},
		]);
	});

	it('commit-msg asks about the same commit, with what it changes', () => {
		expect(
			operationsForHook('commit-msg', ['.git/COMMIT_EDITMSG'], '', {
				branch: 'delendai/wip/glm-5/review/batch-all-g1/pack',
				isMerge: false,
				inMainWorktree: false,
				paths: ['packages/cli/src/index.ts'],
				docsDir: 'docs/delendai',
			}),
		).toEqual([
			{
				kind: 'commit',
				branch: 'delendai/wip/glm-5/review/batch-all-g1/pack',
				isMerge: false,
				inMainWorktree: false,
				paths: ['packages/cli/src/index.ts'],
				docsDir: 'docs/delendai',
			},
		]);
	});

	it('reference-transaction judges only creations, only when prepared', () => {
		const stdin = [
			`${ZERO} ${A} refs/heads/agent/x`,
			`${A} ${B} refs/heads/develop`,
			`${A} ${ZERO} refs/heads/old`,
		].join('\n');
		const facts = { branch: undefined, isMerge: false };
		expect(
			operationsForHook(
				'reference-transaction',
				['prepared'],
				stdin,
				facts,
			),
		).toEqual([{ kind: 'branch-create', ref: 'refs/heads/agent/x' }]);
		expect(
			operationsForHook(
				'reference-transaction',
				['committed'],
				stdin,
				facts,
			),
		).toEqual([]);
	});

	it('reference-transaction judges every write to the stash, not only the first', () => {
		// A second stash updates `refs/stash` instead of creating it, so
		// judging creations alone let every stash after the first through.
		const facts = { branch: undefined, isMerge: false };
		const first = `${ZERO} ${A} refs/stash`;
		const next = `${A} ${B} refs/stash`;
		const dropLast = `${A} ${ZERO} refs/stash`;
		for (const line of [first, next]) {
			expect(
				operationsForHook(
					'reference-transaction',
					['prepared'],
					line,
					facts,
				),
			).toEqual([{ kind: 'stash' }]);
		}
		// Removing the stash is how an existing one gets cleaned up.
		expect(
			operationsForHook(
				'reference-transaction',
				['prepared'],
				dropLast,
				facts,
			),
		).toEqual([]);
		expect(
			operationsForHook(
				'reference-transaction',
				['committed'],
				next,
				facts,
			),
		).toEqual([]);
	});

	it('pre-push reads every pushed ref and marks deletes', () => {
		const stdin = [
			`refs/heads/wip/a/x ${A} refs/heads/wip/a/x ${ZERO}`,
			`(delete) ${ZERO} refs/heads/old ${B}`,
			'',
		].join('\n');
		expect(
			operationsForHook('pre-push', ['origin', 'url'], stdin, {
				branch: undefined,
				isMerge: false,
			}),
		).toEqual([
			// The remote has no such branch: the push creates it.
			{
				kind: 'push',
				remoteRef: 'refs/heads/wip/a/x',
				deleting: false,
				creating: true,
			},
			{ kind: 'push', remoteRef: 'refs/heads/old', deleting: true },
		]);
	});

	it('pre-push asks whether the tip a deletion removes is kept elsewhere', () => {
		const asked: string[] = [];
		const stdin = `(delete) ${ZERO} refs/heads/wip/a/x ${B}\n`;
		expect(
			operationsForHook('pre-push', ['origin', 'url'], stdin, {
				branch: undefined,
				isMerge: false,
				tipKept: (sha, ref) => {
					asked.push(`${sha} ${ref}`);
					return false;
				},
			}),
		).toEqual([
			{
				kind: 'push',
				remoteRef: 'refs/heads/wip/a/x',
				deleting: true,
				deletedTipKept: false,
			},
		]);
		expect(asked).toEqual([`${B} refs/heads/wip/a/x`]);
	});
});

const context = (workspace: string): ICliCommandContext =>
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: workspace,
		globals: fakePartial<ICliCommandContext['globals'], 'workspace'>({
			workspace,
		}),
	});

const facts = (over: Partial<IGuardFacts>): IGuardFacts => ({
	branch: () => 'develop',
	isMerge: () => false,
	inMainWorktree: () => true,
	stdin: async () => '',
	policy: async () =>
		resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-merge' },
		}),
	...over,
});

const personPolicy = async () =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-merge',
			guard: { unknownActor: 'person' },
		},
	});

const AGENT_VARIABLES = [
	'DELENDAI_AGENT_ID',
	'AI_AGENT',
	'CLAUDECODE',
	'CLAUDE_CODE_ENTRYPOINT',
	'GEMINI_CLI',
	'OPENCODE',
	'CODEX_SANDBOX',
	'CODEX_THREAD_ID',
	'CURSOR_AGENT',
	'CURSOR_TRACE_ID',
	'DELENDAI_SESSION',
] as const;

const commitOnIntegration = (over: Partial<IGuardFacts> = {}) =>
	createGuardCommand(() => facts(over)).run(['pre-commit'], context('/ws'));

describe('who is running git', () => {
	beforeEach(() => {
		for (const name of AGENT_VARIABLES) vi.stubEnv(name, '');
		vi.stubEnv('CI', '');
	});

	it.each(AGENT_VARIABLES.filter((name) => name !== 'DELENDAI_SESSION'))(
		'refuses a commit on the integration branch under %s',
		async (name) => {
			vi.stubEnv(name, 'x');
			// Even a policy that lets unidentified people through: the
			// marker identifies an agent.
			const result = await commitOnIntegration({ policy: personPolicy });
			expect(result.code).not.toBe(0);
			expect(result.error).toContain(`\`${name}\``);
		},
	);

	it('refuses a commit made through a delendai session', async () => {
		vi.stubEnv('DELENDAI_SESSION', '1');
		const result = await commitOnIntegration({ policy: personPolicy });
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('DELENDAI_SESSION');
	});

	it('names the workflow and how to get a unit in the refusal', async () => {
		vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
		const result = await commitOnIntegration({
			policy: async () =>
				resolveDevelopmentPolicy({
					development: { profile: 'shared-checkout-pr' },
				}),
		});
		expect(result.error).toContain('`shared-checkout-pr`');
		expect(result.error).toContain('delendai work enter');
		expect(result.error).toContain('DELENDAI_AGENT_ID');
	});

	it('follows the policy when nothing identifies the actor', async () => {
		const asAgent = await commitOnIntegration();
		expect(asAgent.code).not.toBe(0);
		expect(asAgent.error).toContain('unidentified actor');
		expect((await commitOnIntegration({ policy: personPolicy })).code).toBe(
			0,
		);
	});

	it('leaves CI alone when nothing identifies an agent', async () => {
		vi.stubEnv('CI', 'true');
		expect((await commitOnIntegration()).code).toBe(0);
		// CI does not shelter a process an agent marker identifies.
		vi.stubEnv('AI_AGENT', 'x');
		expect((await commitOnIntegration()).code).not.toBe(0);
	});
});

describe('guard command', () => {
	it('refuses with the policy reason and remedy', async () => {
		const result = await createGuardCommand(() => facts({})).run(
			['pre-commit'],
			context('/ws'),
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('refused');
		expect(result.error).toContain('`shared-checkout-merge`');
		expect(result.error).toContain('Do not create worktrees or branches');
	});

	it('answers an inherited property name as an unknown hook (x00558)', async () => {
		// `MANAGEMENT[hook]` on a plain object resolved `toString` and
		// `constructor` to inherited members instead of reaching the
		// unknown-command answer.
		for (const name of ['toString', 'constructor', 'hasOwnProperty']) {
			const result = await createGuardCommand(() => facts({})).run(
				[name],
				context('/ws'),
			);
			expect(result.error).toContain('unknown hook');
		}
	});

	it('judges a runtime with no agent marker as the agent its worktree was made for (x00688)', async () => {
		for (const name of AGENT_VARIABLES) {
			vi.stubEnv(name, '');
		}
		const person = await createGuardCommand(() =>
			facts({ policy: personPolicy }),
		).run(['pre-commit'], context('/ws'));
		expect(person.code).toBe(0);
		const stamped = await createGuardCommand(() =>
			facts({ worktreeAgent: () => 'glm-5' }),
		).run(['pre-commit'], context('/ws'));
		expect(stamped.code).not.toBe(0);
		expect(stamped.error).toContain('the worktree delendai made for glm-5');
		// A worktree made before the stamp: its work branch names the agent.
		const named = await createGuardCommand(() =>
			facts({
				branch: () => 'delendai/wip/minimax-3/review/x00001-S1-g1/t',
				inMainWorktree: () => false,
				stdin: async () => `${ZERO} ${A} refs/stash\n`,
				policy: async () =>
					resolveDevelopmentPolicy({
						development: {
							profile: 'shared-checkout-pr',
							branches: { namespacePrefix: 'delendai' },
						},
					}),
			}),
		).run(['reference-transaction', 'prepared'], context('/ws'));
		expect(named.code).not.toBe(0);
		expect(named.error).toContain(
			'the worktree delendai made for minimax-3',
		);
	});

	it('rejects an unknown hook as a usage error', async () => {
		const result = await createGuardCommand(() => facts({})).run(
			['post-rewrite'],
			context('/ws'),
		);
		expect(result.error).toContain('unknown hook');
	});
});

describe('post-checkout (x00553)', () => {
	const pinned = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});

	it('says the shared checkout left the integration node, and how to return', () => {
		const warning = checkoutWarning(
			pinned,
			{
				branch: 'delendai/wip/claude-opus-5/x00553-S1-g1/topic',
				inMainWorktree: true,
			},
			['old', 'new', '1'],
		);
		expect(warning).toContain('delendai/wip/claude-opus-5');
		expect(warning).toContain('git switch develop');
		expect(warning).toContain('delendai work');
	});

	it('says nothing on the integration branch, in a worktree, or for a file checkout', () => {
		const inMain = {
			branch: 'delendai/wip/a/b',
			inMainWorktree: true,
		} as const;
		expect(
			checkoutWarning(
				pinned,
				{ branch: 'develop', inMainWorktree: true },
				['old', 'new', '1'],
			),
		).toBe('');
		expect(
			checkoutWarning(
				pinned,
				{ branch: 'delendai/wip/a/b', inMainWorktree: false },
				['old', 'new', '1'],
			),
		).toBe('');
		expect(checkoutWarning(pinned, inMain, ['old', 'new', '0'])).toBe('');
		expect(checkoutWarning(pinned, inMain, [])).toBe('');
	});

	it('says nothing when the profile does not pin the checkout', () => {
		const free = resolveDevelopmentPolicy({
			development: { profile: 'worktree-pr' },
		});
		expect(
			checkoutWarning(
				free,
				{ branch: 'agent/claude/x', inMainWorktree: true },
				['old', 'new', '1'],
			),
		).toBe('');
	});
});

describe('a guard never authorises what it did not check (x00580)', () => {
	it('refuses when the policy is declared and unreadable', async () => {
		// A project with a broken `delendai.config.json` is a project whose
		// rules nobody is applying — and the operations this hook guards
		// are exactly the ones the rules exist for. Passing them because
		// the rulebook is unreadable is the fail-open shape this cycle has
		// found three times now.
		const result = await createGuardCommand(() =>
			facts({
				policy: async () => {
					throw new Error(
						'Unexpected token } in JSON at position 42',
					);
				},
			}),
		).run(['pre-commit'], context('/ws'));
		expect(result.code).not.toBe(0);
	});
});

describe('a project whose trunk is not develop can still commit (x00602)', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	const consumer = (config: string): string => {
		const root = mkdtempSync(join(tmpdir(), 'guard-consumer-'));
		roots.push(root);
		execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
		writeFileSync(join(root, 'delendai.config.json'), config);
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		execFileSync('git', ['add', '-A'], { cwd: root });
		execFileSync(
			'git',
			[
				'-c',
				'user.email=t@t',
				'-c',
				'user.name=t',
				'commit',
				'-q',
				'-m',
				'base',
			],
			{ cwd: root },
		);
		return root;
	};

	const refusal = async (config: string): Promise<string> => {
		const root = consumer(config);
		const result = await createGuardCommand().run(
			['pre-commit'],
			context(root),
		);
		return result.error ?? '';
	};

	it('names the branch the project is actually on, not `develop`', async () => {
		// Before this, a consumer on `main` was told: "the shared checkout
		// is on `main`, but the profile anchors it to `develop`. Return it
		// with `git switch develop`" — a branch their repository does not
		// have. Every commit refused, with an impossible remedy.
		const said = await refusal(
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		expect(said).not.toContain('git switch develop');
		expect(said).not.toContain('anchors it to `develop`');
		// The profile does forbid committing to the integration branch —
		// that refusal is correct. What changed is which branch it names,
		// and that the remedy is the workflow rather than a branch switch.
		expect(said).toContain('committing directly to `main`');
	});

	it('judges a project that declares no policy by the model delendai adopts for it', async () => {
		// "Refuses nothing" was the old answer, and it left the served
		// instructions describing a workflow no hook enforced. The default
		// profile is one model, read by the guard, `work` and the
		// instructions alike.
		const said = await refusal('{}');
		expect(said).toContain('`shared-checkout-merge`');
		expect(said).toContain('committing directly to `main`');
	});

	it('still points at a branch the project DID declare', async () => {
		// Declaring is the stronger statement: a project that says `trunk`
		// while sitting on `main` has wandered and wants to be told so —
		// and `trunk` is a branch it can actually switch to.
		const said = await refusal(
			'{ "development": { "profile": "shared-checkout-merge", "branches": { "integration": "trunk" } } }',
		);
		// The project names `trunk` and no release branch, so `main` is not
		// one of its branches: standing on it is outside the model, and the
		// refusal says which branches the model uses.
		expect(said).toContain('`main` is outside the branches');
		expect(said).toContain('the shared checkout stays on `trunk`');
	});
});

describe('defaultGuardFacts.tipKept (x00687)', () => {
	it('keeps a tip another ref holds, and not one only the deleted branch holds', () => {
		const root = mkdtempSync(join(tmpdir(), 'guard-tip-kept-'));
		try {
			const git = (...args: string[]): string =>
				execFileSync('git', args, {
					cwd: root,
					encoding: 'utf8',
				}).trim();
			git('init', '-q', '-b', 'develop');
			git('config', 'user.email', 'a@example.com');
			git('config', 'user.name', 'A');
			git('commit', '-q', '--allow-empty', '--no-verify', '-m', 'base');
			git('switch', '-q', '-c', 'wip/a/x');
			git('commit', '-q', '--allow-empty', '--no-verify', '-m', 'work');
			const tip = git('rev-parse', 'HEAD');
			git('update-ref', 'refs/remotes/origin/wip/a/x', tip);
			const facts = defaultGuardFacts(root);
			expect(facts.tipKept?.(tip, 'refs/heads/wip/a/x')).toBe(false);
			git('update-ref', 'refs/remotes/origin/pr/a/x', tip);
			expect(facts.tipKept?.(tip, 'refs/heads/wip/a/x')).toBe(true);
			expect(
				facts.tipKept?.(
					'0123456789abcdef0123456789abcdef01234567',
					'refs/heads/wip/a/x',
				),
			).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe('guard command, a unit of work', () => {
	const unitPolicy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});
	const UNIT = 'delendai/wip/claude-sonnet-5-5/create/x00799-all-g1';
	const push = (branch: string): string =>
		`refs/heads/${branch} ${A} refs/heads/${branch} ${ZERO}\n`;

	it('refuses a scratch ref pushed into a unit that has its own', async () => {
		const result = await createGuardCommand(() =>
			facts({
				policy: async () => unitPolicy,
				stdin: async () => push(`${UNIT}/sim-a`),
				unitRefs: async () => ({
					siblings: [`${UNIT}/the-work`],
					leasedRef: `${UNIT}/the-work`,
				}),
			}),
		).run(['pre-push', 'origin', 'url'], context('/ws'));
		expect(result.code).not.toBe(0);
		expect(result.error).toContain('second ref');
	});

	it('lets the unit push its own ref', async () => {
		const result = await createGuardCommand(() =>
			facts({
				policy: async () => unitPolicy,
				stdin: async () => push(`${UNIT}/the-work`),
				unitRefs: async () => ({
					siblings: [],
					leasedRef: `${UNIT}/the-work`,
				}),
			}),
		).run(['pre-push', 'origin', 'url'], context('/ws'));
		expect(result.code).toBe(0);
	});

	it('shows life on the unit when a commit is allowed, and never fails on it', async () => {
		const showLife = vi.fn().mockRejectedValue(new Error('disk full'));
		const result = await createGuardCommand(() =>
			facts({
				policy: async () => unitPolicy,
				branch: () => `${UNIT}/the-work`,
				inMainWorktree: () => false,
				showLife,
			}),
		).run(['pre-commit'], context('/ws'));
		expect(result.code).toBe(0);
		expect(showLife).toHaveBeenCalledOnce();
	});
});

describe('guard command, a unit known only by its lease', () => {
	it('judges the actor as the lease owner when no stamp says whose the worktree is', async () => {
		const result = await createGuardCommand(() =>
			facts({
				policy: async () =>
					resolveDevelopmentPolicy({
						development: {
							profile: 'shared-checkout-pr',
							branches: { namespacePrefix: 'delendai' },
						},
					}),
				branch: () => 'delendai/wip/some-model/implement/x1-S1-g1/work',
				inMainWorktree: () => false,
				leaseAgent: async () => 'some-model',
			}),
		).run(['post-checkout', 'a', 'b', '1'], context('/ws'));
		expect(result.code).toBe(0);
	});
});
