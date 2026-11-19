import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
	git: new Map<string, string | undefined>(),
	proof: { passed: true, declared: true, steps: [] } as Record<
		string,
		unknown
	>,
	opened: {
		engine: {},
		policy: {
			identity: undefined,
			branches: { integration: 'develop', namespacePrefix: 'dl' },
		},
		root: '/r',
	} as Record<string, unknown>,
	only: false,
	base: 'BASE' as string | undefined,
	known: '["a/old.spec.ts"]' as string | undefined,
}));

vi.mock('@delendai/core/lib/work-units/work-unit-shared.service', () => ({
	agentFor: () => 'agent',
	integrationBase: () => m.base,
	integrationRemote: () => 'origin',
	mainWorktreeOf: (cwd: string) => cwd,
	openWork: () => Promise.resolve(m.opened),
	readGit: (_r: string, a: readonly string[]) =>
		a[0] === 'notes' ? m.known : m.git.get(a[0] ?? ''),
	refused: (reason: string, remedy: string) => ({
		code: 1,
		error: `${reason}\n${remedy}`,
	}),
}));
vi.mock('@delendai/core/lib/work-units/work-unit-prove-only.service', () => ({
	asksForOneGate: () => m.only,
	provedOnly: () => Promise.resolve({ code: 0, data: 'only' }),
}));
vi.mock('@delendai/core/lib/work-units/work-unit-proof.service', () => ({
	proveUnit: () => Promise.resolve(m.proof),
	describeFailedProof: () => 'was NOT published',
}));
vi.mock('@delendai/core/lib/work-units/work-unit-generation.service', () => ({
	existingWorkRef: () => 'refs/heads/wip',
}));
vi.mock('@delendai/core/lib/work-units/unit-removal.service', () => ({
	worktreeOfRef: () => '/wt',
}));
vi.mock('@delendai/core/lib/work-units/work-publish.service', () => ({
	publicationRefFromWorkRef: () => 'pub',
}));
import {
	proved,
	subtractBaseFailures,
} from '@delendai/core/lib/work-units/work-unit-prove.service';
import type { IUnitProofReport } from '@delendai/core/lib/contracts/interfaces/unit-proof.interface';

const failed = (tail: string): IUnitProofReport => ({
	declared: true,
	passed: false,
	steps: [
		{
			command: 'bun run prove',
			scope: 'all',
			passed: false,
			outputTail: tail,
		},
	],
});

describe('subtractBaseFailures', () => {
	it('[<50ms] reports a known-failing spec outside the unit footprint as base, not the unit', () => {
		const out = subtractBaseFailures({
			report: failed('FAIL a/old.spec.ts'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(['b/new.ts']),
		});
		expect(out).toEqual({
			own: [],
			base: ['a/old.spec.ts'],
			passed: true,
		});
	});

	it('[<50ms] fails the proof when the unit touched the known-failing spec footprint', () => {
		const out = subtractBaseFailures({
			report: failed('FAIL a/old.spec.ts'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(['a/old.spec.ts']),
		});
		expect(out.own).toEqual(['a/old.spec.ts']);
		expect(out.passed).toBe(false);
	});

	it('[<50ms] keeps a spec develop does not know as the unit failure', () => {
		const out = subtractBaseFailures({
			report: failed('FAIL a/old.spec.ts\nFAIL c/mine.spec.ts'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(),
		});
		expect(out.own).toEqual(['c/mine.spec.ts']);
		expect(out.base).toEqual(['a/old.spec.ts']);
		expect(out.passed).toBe(false);
	});

	it('[<50ms] does not excuse a failed step that names no spec', () => {
		const out = subtractBaseFailures({
			report: failed('tsc error TS2322'),
			known: new Set(['a/old.spec.ts']),
			touched: new Set(),
		});
		expect(out.passed).toBe(false);
	});
});

const ctx = {
	cwd: '/r',
	globals: { workspace: '/r', json: true, format: 'json' },
};
const full = ['--proposal=x', '--slice=S1', '--agent=a'];

describe('proved', () => {
	beforeEach(() => {
		m.git = new Map([
			['rev-parse', 'TIP'],
			['rev-list', 'BASE'],
			['diff', 'b/new.ts\n'],
		]);
		m.proof = { passed: true, declared: true, steps: [] };
		m.opened = {
			engine: {},
			policy: {
				identity: undefined,
				branches: { integration: 'develop', namespacePrefix: 'dl' },
			},
			root: '/r',
		};
		m.only = false;
		m.base = 'BASE';
		m.known = '["a/old.spec.ts", 3]\n';
	});

	it('[<50ms] hands one gate over', async () => {
		m.only = true;
		expect((await proved(full, ctx)).data).toBe('only');
	});

	it('[<50ms] returns what a workspace that cannot open answers', async () => {
		m.opened = { code: 1 };
		expect((await proved(full, ctx)).code).toBe(1);
	});

	it('[<50ms] refuses missing arguments', async () => {
		expect((await proved(['--proposal=x'], ctx)).code).not.toBe(0);
	});

	it('[<50ms] refuses an unresolved tip or base', async () => {
		m.base = undefined;
		expect((await proved(full, ctx)).error).toContain(
			'resolves to no commit',
		);
	});

	it('[<50ms] locates the unit', async () => {
		const out = await proved([...full, '--locate'], ctx);
		expect(out.data).toMatchObject({
			workRef: 'refs/heads/wip',
			worktree: '/wt',
			publication: 'pub',
		});
	});

	it('[<50ms] reports a declared pass', async () => {
		expect((await proved(full, ctx)).data).toMatchObject({
			proved: true,
			remembered: false,
		});
	});

	it('[<50ms] says nothing is declared', async () => {
		m.proof = { passed: true, declared: false, steps: [] };
		expect((await proved(full, ctx)).data).toHaveProperty('nextAction');
	});

	it('[<50ms] refuses a failed proof', async () => {
		m.proof = {
			passed: false,
			declared: true,
			steps: [
				{
					command: 'c',
					scope: 's',
					passed: false,
					outputTail: 'tsc error',
				},
			],
		};
		expect((await proved(full, ctx)).error).toContain('was not proved');
	});

	it('[<50ms] passes a proof that failed only on a base failure', async () => {
		m.proof = {
			passed: false,
			declared: true,
			steps: [
				{
					command: 'c',
					scope: 's',
					passed: false,
					outputTail: 'FAIL a/old.spec.ts',
				},
			],
		};
		const out = await proved(full, ctx);
		expect(out.data).toMatchObject({ baseFailures: ['a/old.spec.ts'] });
	});

	it('[<50ms] has no base failures when no known set is kept', async () => {
		m.known = undefined;
		m.git.delete('diff');
		m.proof = {
			passed: false,
			declared: true,
			steps: [
				{
					command: 'c',
					scope: 's',
					passed: false,
					outputTail: 'FAIL a/old.spec.ts',
				},
			],
		};
		expect((await proved(full, ctx)).error).toContain('was not proved');
	});
});
