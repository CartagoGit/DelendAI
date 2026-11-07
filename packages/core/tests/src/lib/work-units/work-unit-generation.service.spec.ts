/**
 * A unit's generation and its refs in a namespace transition (f00808): a
 * unit entered under a former namespace is still the same unit, and a
 * generation retired under it is still spent.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { stampWorktreeAgent } from '@delendai/core/lib/work-units/worktree-agent.service';
import {
	ambiguousUnit,
	chooseGeneration,
	endedGenerations,
	existingWorkRef,
	sessionHolding,
	unitGeneration,
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

const OLD = 'refs/heads/delendai/wip/agent-a/implement/x00001-S1-g1/topic';
const NEW = 'refs/heads/wip/agent-a/implement/x00001-S1-g1/topic';
const ARGS = ['--kind=implement', '--topic=topic'];

const template = createGitRepoTemplate({
	trunk: 'develop',
	files: { 'a.ts': 'export const a = 1;\n' },
});

const repo = (): string => template.copy().root;

describe('a unit under a former namespace', () => {
	it('is the unit work enter finds again', () => {
		const root = repo();
		git(root, 'update-ref', OLD, 'HEAD');
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(OLD);
	});

	it('leaves a new unit under the current namespace', () => {
		const root = repo();
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(NEW);
		expect(
			chooseGeneration(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toEqual({ generation: 1 });
	});

	it('keeps a generation retired under the former root spent', () => {
		const root = repo();
		git(
			root,
			'update-ref',
			'refs/delendai/retired/agent-a/implement/x00001-S1-g1/topic',
			'HEAD',
		);
		git(root, 'remote', 'add', 'origin', root);
		expect([...endedGenerations(root, policy, NEW)]).toEqual([1]);
		expect(
			chooseGeneration(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toEqual({ generation: 2 });
	});

	it('is ambiguous when two names answer for one unit', () => {
		const root = repo();
		git(root, 'update-ref', OLD, 'HEAD');
		git(root, 'update-ref', NEW, 'HEAD');
		expect(
			ambiguousUnit(
				root,
				['--kind=implement'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBeDefined();
		expect(sessionHolding(root, NEW)).toBeUndefined();
	});

	it('reads the generation the arguments name', () => {
		expect(unitGeneration(['--generation=3'])).toBe(3);
		expect(unitGeneration([])).toBe(1);
	});
});

describe('a unit generation, against real refs', () => {
	const worktreeOn = (root: string, ref: string, session: string): string => {
		const dir = `${root}-wt-${session}`;
		git(root, 'worktree', 'add', '-q', dir, ref.replace('refs/heads/', ''));
		stampWorktreeAgent(dir, 'agent-a', session);
		return dir;
	};

	it('names the session whose worktree holds a ref, and none for a bare ref', () => {
		const root = repo();
		git(root, 'update-ref', NEW, 'HEAD');
		expect(sessionHolding(root, NEW)).toBeUndefined();
		worktreeOn(root, NEW, 's1');
		expect(sessionHolding(root, NEW)).toBe('s1');
	});

	it('sends a session back to the generation it holds', () => {
		const root = repo();
		const second = NEW.replace('-g1/', '-g2/');
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

	it('refuses a slice another session of the agent works on', () => {
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

	it('counts a generation merged into the integration branch as spent', () => {
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
			'Merge wip/agent-a/implement/x00001-S1-g1/topic',
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

	it('sends the entrant back to its own open publication, unless alongside', () => {
		const root = repo();
		const publication =
			'refs/heads/pr/agent-a/implement/x00001-S1-g1/topic';
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

	it('finds a unit by the session holding it, or by its kindless legacy name', () => {
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
