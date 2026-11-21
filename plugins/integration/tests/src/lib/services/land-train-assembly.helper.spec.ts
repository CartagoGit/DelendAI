/**
 * land-train-assembly.helper.spec.ts — how a batch is assembled and pushed,
 * against a scripted git: the order of its commands, what it leaves out,
 * and that the push is the identity's, forced, and hook-free.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ICall {
	readonly sub: string;
	readonly env: Record<string, string | undefined> | undefined;
}

const calls: ICall[] = [];
let answer: (sub: string) => string = () => '';

vi.mock('node:child_process', () => ({
	execFileSync: (
		command: string,
		args: string[],
		options?: { env?: Record<string, string | undefined> },
	): string => {
		if (command === 'mktemp') return '/scratch\n';
		if (command !== 'git') return '';
		// Every git call starts with the hook-free prefix.
		expect(args.slice(0, 2)).toEqual(['-c', 'core.hooksPath=/dev/null']);
		const sub = args.slice(2).join(' ');
		calls.push({ sub, env: options?.env });
		return answer(sub);
	},
}));

const { assembleTrain, discardTrain, runGit } = await import(
	'../../../../src/lib/services/land-train-assembly.helper'
);

const refuse = (stdout = '', stderr = ''): never => {
	throw Object.assign(new Error('git failed'), { stdout, stderr });
};
const member = { number: 7, headRef: 'topic', headSha: 'h7' };
const base = {
	root: '/clone',
	remote: 'origin',
	tipSha: 'tip',
	ref: 'batch-7',
	members: [member],
	derived: new Set(['gen.md']),
	regenerate: () => true,
	identityToken: 'tok',
};
const subs = (): string[] => calls.map((c) => c.sub);
const merges = (sub: string): boolean => sub.includes('merge --no-ff');

beforeEach(() => {
	calls.length = 0;
	answer = () => '';
});

describe('assembling a train', () => {
	it('[<50ms] merges each member, regenerates once and pushes forced as the identity', () => {
		answer = (sub) => (sub === 'status --porcelain' ? ' M gen.md' : '');
		const built = assembleTrain(base);
		expect(built).toEqual({ conflicting: [], regenerated: [] });
		const order = subs();
		expect(order.findIndex(merges)).toBeLessThan(
			order.findIndex((s) => s.includes('push')),
		);
		expect(order.some((s) => s.includes('commit -q -m'))).toBe(true);
		const push = calls.find((c) => c.sub.startsWith('push'));
		expect(push?.sub).toBe(
			'push -q --force -- origin HEAD:refs/heads/batch-7',
		);
		expect(push?.env?.GIT_CONFIG_VALUE_1).toContain('AUTHORIZATION');
		expect(order.at(-1)).toBe('worktree prune');
	});

	it('[<50ms] leaves a member out when its commit cannot be fetched', () => {
		answer = (sub) => (sub.startsWith('fetch') ? refuse() : '');
		expect(assembleTrain(base).conflicting).toEqual([7]);
		expect(subs().some((s) => s.startsWith('push'))).toBe(false);
	});

	it('[<50ms] aborts and leaves a member out when it conflicts in authored code', () => {
		answer = (sub) => {
			if (merges(sub)) return refuse();
			return sub.startsWith('diff') ? 'src/x.ts' : '';
		};
		expect(assembleTrain(base).conflicting).toEqual([7]);
		expect(subs()).toContain('merge --abort');
		expect(subs().some((s) => s.startsWith('push'))).toBe(false);
	});

	it('[<50ms] aborts when git reports a conflict naming no file', () => {
		answer = (sub) => (merges(sub) ? refuse() : '');
		expect(assembleTrain(base).conflicting).toEqual([7]);
	});

	it('[<50ms] keeps the train side of a derived-only conflict and regenerates', () => {
		answer = (sub) => {
			if (merges(sub)) return refuse();
			return sub.startsWith('diff') ? 'gen.md' : '';
		};
		const built = assembleTrain(base);
		expect(built.regenerated).toEqual([7]);
		expect(subs()).toContain('checkout --ours -- gen.md');
	});

	it('[<50ms] leaves the member out when the derived conflict cannot be committed', () => {
		answer = (sub) => {
			if (merges(sub) || sub.includes('commit --no-edit'))
				return refuse();
			return sub.startsWith('diff') ? 'gen.md' : '';
		};
		expect(assembleTrain(base).conflicting).toEqual([7]);
	});

	it('[<50ms] returns the regenerated members as conflicting when the regeneration fails', () => {
		answer = (sub) => {
			if (merges(sub)) return refuse();
			return sub.startsWith('diff') ? 'gen.md' : '';
		};
		const built = assembleTrain({ ...base, regenerate: () => false });
		expect(built).toEqual({ conflicting: [7], regenerated: [] });
	});

	it('[<50ms] says why nothing was pushed when the regeneration or the linking fails', () => {
		expect(
			assembleTrain({ ...base, regenerate: () => false }).pushFailure,
		).toContain('regenerating');
		expect(
			assembleTrain({ ...base, linkDependencies: () => false })
				.pushFailure,
		).toContain('linking');
	});

	it('[<50ms] says why nothing was pushed when the regeneration commit fails', () => {
		answer = (sub) => {
			if (sub === 'status --porcelain') return ' M gen.md';
			return sub === 'add -A' ? refuse('', 'index locked') : '';
		};
		expect(assembleTrain(base).pushFailure).toContain(
			'committing the regeneration failed: index locked',
		);
	});

	it('[<50ms] reports what a refusing push said on both streams', () => {
		answer = (sub) =>
			sub.startsWith('push') ? refuse('hook says no', 'rejected') : '';
		expect(assembleTrain(base).pushFailure).toBe('hook says no\nrejected');
	});

	it('[<50ms] says when the scratch worktree cannot be made', () => {
		answer = (sub) =>
			sub.startsWith('worktree add') ? refuse('', 'bad') : '';
		expect(assembleTrain(base).pushFailure).toContain(
			'git worktree add failed: bad',
		);
	});

	it('[<50ms] keeps the scratch of a rehearsal and pushes nothing', () => {
		const built = assembleTrain({ ...base, rehearsal: true });
		expect(built.scratch).toBe('/scratch');
		expect(subs().some((s) => s.startsWith('push'))).toBe(false);
		expect(subs()).not.toContain('worktree prune');
	});

	it('[<50ms] lets the project normalise the merged tree and commit its changes', () => {
		assembleTrain({
			...base,
			normalize: (_dir, commit) => commit('normalise'),
		});
		expect(subs()).toContain('add -A');
		expect(subs().some((s) => s.includes('commit -q -m normalise'))).toBe(
			true,
		);
	});
});

describe('the clone helpers', () => {
	it('[<20ms] discards a scratch worktree even when git cannot', () => {
		answer = () => refuse();
		expect(() => discardTrain('/clone', '/scratch')).not.toThrow();
	});

	it('[<20ms] runs git hook-free with the given environment, trimmed', () => {
		answer = () => 'out\n';
		expect(runGit('/clone', ['status'], { A: '1' })).toBe('out');
		expect(calls[0]?.env?.A).toBe('1');
	});
});
