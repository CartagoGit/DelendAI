/**
 * A unit's generation and its refs in a namespace transition (f00808): a
 * unit entered under a former namespace is still the same unit, and a
 * generation retired under it is still spent.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { READABLE_WORK_REF_SHAPE } from '@delendai/core/lib/development-policy/profiles.constant';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { stampWorktreeAgent } from '@delendai/core/lib/work-units/worktree-agent.service';
import {
	ambiguousUnit,
	chooseGeneration,
	endedGenerations,
	existingWorkRef,
	sessionHolding,
} from '@delendai/core/lib/work-units/work-unit-generation.service';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
		{
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	).trim();

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

const readablePolicy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			workRefTemplate: `heads/wip/${READABLE_WORK_REF_SHAPE}`,
		},
	},
});

const NEW = 'refs/heads/wip/implement/agent-a/x00001-S1/topic';
const ARGS = ['--kind=implement', '--topic=topic'];

const template = createGitRepoTemplate({
	trunk: 'develop',
	files: { 'a.ts': 'export const a = 1;\n' },
});

const repo = (): string => template.copy().root;

describe('a unit generation, against real refs', () => {
	const worktreeOn = (root: string, ref: string, session: string): string => {
		const dir = `${root}-wt-${session}`;
		git(root, 'worktree', 'add', '-q', dir, ref.replace('refs/heads/', ''));
		stampWorktreeAgent(dir, 'agent-a', session);
		return dir;
	};

	it('[<400ms] names the session whose worktree holds a ref, and none for a bare ref', () => {
		const root = repo();
		git(root, 'update-ref', NEW, 'HEAD');
		expect(sessionHolding(root, NEW)).toBeUndefined();
		worktreeOn(root, NEW, 's1');
		expect(sessionHolding(root, NEW)).toBe('s1');
	});

	it('[<400ms] sends a session back to the generation it holds', () => {
		const root = repo();
		const second = NEW.replace('x00001-S1/', 'x00001-S1-G2/');
		git(root, 'update-ref', second, 'HEAD');
		worktreeOn(root, second, 's2');
		expect(
			chooseGeneration(
				root,
				[...ARGS, '--session=s2'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toEqual({ generation: 2 });
	});

	it('[<400ms] refuses a slice another session of the agent works on', () => {
		const root = repo();
		git(root, 'update-ref', NEW, 'HEAD');
		worktreeOn(root, NEW, 'theirs');
		const chosen = chooseGeneration(
			root,
			[...ARGS, '--session=mine'],
			policy,
			'agent-a',
			'x00001',
			'S1',
		);
		expect('refusal' in chosen).toBe(true);
	});

	it("[<400ms] tells the refused agent to run from inside the holder's worktree, not to pass a session it never saw", () => {
		const root = repo();
		git(root, 'update-ref', NEW, 'HEAD');
		const dir = worktreeOn(root, NEW, 'theirs');
		const chosen = chooseGeneration(
			root,
			[...ARGS, '--session=mine'],
			policy,
			'agent-a',
			'x00001',
			'S1',
		);
		const how = JSON.stringify('refusal' in chosen ? chosen.refusal : {});
		expect(how).toContain('run this again from inside');
		expect(how).toContain(dir);
		expect(how).not.toContain('--session it gave you');
	});

	it('[<400ms] counts a generation merged into the integration branch as spent', () => {
		const root = repo();
		git(root, 'checkout', '-q', '-b', 'side');
		git(root, 'commit', '-q', '--allow-empty', '-m', 'work');
		git(root, 'checkout', '-q', 'develop');
		git(
			root,
			'merge',
			'-q',
			'--no-ff',
			'-m',
			'Merge wip/implement/agent-a/x00001-S1/topic',
			'side',
		);
		expect([...endedGenerations(root, policy, NEW)]).toEqual([1]);
		expect(
			[...endedGenerations(root, policy, 'refs/heads/elsewhere/x')]
				.length,
		).toBe(0);
		expect(
			[...endedGenerations(root, policy, 'refs/heads/wip/no-generation')]
				.length,
		).toBe(0);
	});

	it('[<400ms] sends the entrant back to its own open publication, unless alongside', () => {
		const root = repo();
		const publication = 'refs/heads/pr/implement/agent-a/x00001-S1/topic';
		git(root, 'update-ref', publication, 'HEAD');
		const refused = chooseGeneration(
			root,
			ARGS,
			policy,
			'agent-a',
			'x00001',
			'S1',
		);
		expect('refusal' in refused && refused.refusal.error).toContain(
			'open publication of your own',
		);
		expect(
			chooseGeneration(
				root,
				[...ARGS, '--alongside'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toEqual({ generation: 2 });
	});

	it('[<400ms] finds a unit by the session holding it, or by its kindless legacy name', () => {
		const root = repo();
		git(root, 'update-ref', NEW, 'HEAD');
		const other = NEW.replace('/topic', '/other');
		git(root, 'update-ref', other, 'HEAD');
		worktreeOn(root, other, 'mine');
		expect(
			existingWorkRef(
				root,
				['--session=mine'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBe(other);
		expect(
			ambiguousUnit(
				root,
				['--kind=implement', '--session=mine'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBeUndefined();
		const fresh = repo();
		const legacy = 'refs/heads/wip/agent-a/x00001-S1-g1/topic';
		git(fresh, 'update-ref', legacy, 'HEAD');
		expect(
			existingWorkRef(
				fresh,
				['--topic=topic'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBe(legacy);
		expect(
			existingWorkRef(fresh, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(NEW);
	});
});

describe('a unit under the scope grammar (f00808)', () => {
	const SCOPED = 'refs/heads/wip/implement/agent-a/x00001-S1-G2/topic';

	it('[<400ms] chooseGeneration reads -G{n} from the name when the trailer is absent', () => {
		const root = repo();
		const scoped = SCOPED;
		git(root, 'update-ref', scoped, 'HEAD');
		const dir = `${root}-wt-sg`;
		git(
			root,
			'worktree',
			'add',
			'-q',
			dir,
			scoped.replace('refs/heads/', ''),
		);
		stampWorktreeAgent(dir, 'agent-a', 'sg');
		expect(
			chooseGeneration(
				root,
				[...ARGS, '--session=sg'],
				readablePolicy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toEqual({ generation: 2 });
	});

	it('[<400ms] endedGenerations reads both the old -g{n} and the new -G{n} names', () => {
		const root = repo();
		git(root, 'checkout', '-q', '-b', 'side');
		git(root, 'commit', '-q', '--allow-empty', '-m', 'work');
		git(root, 'checkout', '-q', 'develop');
		for (const [index, name] of [
			'wip/implement/agent-a/x00001-S1/topic',
			'wip/implement/agent-a/x00001-S1-G2/topic',
		].entries()) {
			git(root, 'checkout', '-q', '-b', `side${index}`, 'side');
			git(root, 'commit', '-q', '--allow-empty', '-m', `work ${index}`);
			git(root, 'checkout', '-q', 'develop');
			git(
				root,
				'merge',
				'-q',
				'--no-ff',
				'-m',
				`Merge ${name}`,
				`side${index}`,
			);
		}
		expect([...endedGenerations(root, policy, NEW)].sort()).toEqual([1, 2]);
		expect([...endedGenerations(root, policy, SCOPED)].sort()).toEqual([
			1, 2,
		]);
	});
});
