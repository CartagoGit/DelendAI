/**
 * work-revalidate.service.spec.ts — which proposals the batch selects,
 * and that it prints before it changes anything.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { READY_PROPOSALS_DIR } from '../contracts/constants/work-revalidate.constant';

import {
	parseRevalidateProposal,
	revalidateRefusalOf,
	rewriteDeclaredPath,
	readReadyProposals,
	revalidateBatch,
	selectRevalidation,
} from './work-revalidate.service';
import type {
	IRevalidateProposal,
	IRevalidateSlice,
	IWorkRevalidatePorts,
} from '../contracts/interfaces/work-revalidate.interface';

const slice = (over: Partial<IRevalidateSlice> = {}): IRevalidateSlice => ({
	id: 'S1',
	status: 'pending',
	shippedIn: 'abc123',
	reviewState: 'changes_requested',
	...over,
});

const proposal = (
	id: string,
	slices: readonly IRevalidateSlice[],
	stage = 'ready',
): IRevalidateProposal => ({ id, stage, slices });

const FIXTURE: readonly IRevalidateProposal[] = [
	proposal('f1', [slice(), slice({ id: 'S2' })]),
	proposal('f2', [slice(), slice({ id: 'S2', shippedIn: undefined })]),
	proposal('f3', [slice({ reviewState: 'in_review' })]),
	proposal('f4', [slice()], 'review'),
	proposal('f5', [
		slice(),
		slice({ id: 'S2', status: 'retired', shippedIn: undefined }),
	]),
];

const okPorts = (
	proposals: readonly IRevalidateProposal[],
): IWorkRevalidatePorts => ({
	proposals: async () => proposals,
	heldByUnits: async () => new Set<string>(),
	handoverRefusal: async () => undefined,
	print: () => undefined,
	enter: async () => '/unit',
	developSha: async () => 'abcdef0123456789',
	mark: () => 'mark',
	undo: () => undefined,
	publish: async () => ({ code: 0 }),
	transition: async () => ({ ok: true }),
	exists: () => true,
	git: () => ({ ok: true, out: '' }),
	rewriteDeclared: () => undefined,
});

describe('selectRevalidation', () => {
	it('[<50ms] selects only the proposal whose live slices are all shipped and changes_requested', () => {
		expect(selectRevalidation(FIXTURE).chosen).toEqual(['f1', 'f5']);
	});

	it('[<50ms] leaves out a proposal with no live slice', () => {
		const none = [proposal('f6', [slice({ status: 'retired' })])];
		expect(selectRevalidation(none).chosen).toEqual([]);
	});

	it('[<50ms] reports a named proposal that fails the predicate and still selects the others', () => {
		const result = selectRevalidation(FIXTURE, ['f1', 'f2', 'f4', 'zz']);
		expect(result.chosen).toEqual(['f1']);
		expect(result.refused.map((entry) => entry.id)).toEqual([
			'f2',
			'f4',
			'zz',
		]);
		expect(result.refused[0]?.reason).toContain('S2 has no shipped-in');
		expect(result.refused[1]?.reason).toContain('not ready');
	});
});

describe('parseRevalidateProposal', () => {
	it('[<50ms] reads each slice status, shipped-in and review-state', () => {
		const text = [
			'---',
			'id: f9',
			'---',
			'## slices',
			'### S1 — one',
			'- **Status**: pending',
			'- shipped-in: `deadbeef`',
			'- review-state: changes_requested',
			'### S2 — two',
			'- **Status**: retired',
			'## acceptance',
			'### X — not a slice',
		].join('\n');
		expect(parseRevalidateProposal(text, 'ready')).toEqual({
			id: 'f9',
			stage: 'ready',
			slices: [
				{
					id: 'S1',
					status: 'pending',
					shippedIn: 'deadbeef',
					reviewState: 'changes_requested',
				},
				{
					id: 'S2',
					status: 'retired',
					shippedIn: undefined,
					reviewState: undefined,
				},
			],
		});
	});
});

describe('revalidateBatch', () => {
	const run = async (
		proposals: readonly IRevalidateProposal[],
		flag?: string,
	) => {
		const lines: string[] = [];
		const result = await revalidateBatch(
			{
				...okPorts(proposals),
				print: (l) => lines.push(l),
			},
			flag,
		);
		return { lines, result };
	};

	it('[<50ms] prints the chosen ids one per line', async () => {
		const { lines, result } = await run(FIXTURE);
		expect(lines).toEqual(['f1', 'f5']);
		expect(result.code).toBe(0);
	});

	it('[<50ms] says it chose none and exits 0 when nothing qualifies', async () => {
		const { lines, result } = await run([]);
		expect(lines).toEqual(['chose none']);
		expect(result.code).toBe(0);
	});

	it('[<50ms] reports a named proposal left out by id with its reason', async () => {
		const { lines } = await run(FIXTURE, 'f1,f3');
		expect(lines[0]).toContain('left out f3');
		expect(lines).toContain('f1');
	});
});

describe('revalidateBatch units and transitions', () => {
	const THREE: readonly IRevalidateProposal[] = [
		proposal('f1', [slice()]),
		proposal('f2', [slice()]),
		proposal('f3', [slice()]),
	];

	const unit = (refusing: readonly string[] = []) => {
		const published: unknown[][] = [];
		const transitions: string[] = [];
		const calls = {
			enter: 0,
			undo: 0,
			publish: published,
			transitions,
		};
		const ports: IWorkRevalidatePorts = {
			proposals: async () => THREE,
			heldByUnits: async () => new Set<string>(),
			handoverRefusal: async () => undefined,
			print: () => undefined,
			enter: async () => {
				calls.enter += 1;
				return '/unit';
			},
			developSha: async () => 'abcdef0123456789',
			mark: () => 'mark',
			publish: async (...given: unknown[]) => {
				calls.publish.push(given);
				return { code: 0 };
			},
			undo: () => {
				calls.undo += 1;
			},
			exists: () => true,
			git: () => ({ ok: true, out: '' }),
			rewriteDeclared: () => undefined,
			transition: async ({ id, to, reason }) => {
				calls.transitions.push(`${id}:${to}`);
				expect(reason).toContain('abcdef012345');
				return refusing.includes(id)
					? { ok: false, reason: `${id} refused` }
					: { ok: true };
			},
		};
		return { calls, ports };
	};

	it('[<100ms] enters one unit for a selection of three proposals', async () => {
		const { calls, ports } = unit();
		const result = await revalidateBatch(ports, undefined);
		expect(calls.enter).toBe(1);
		expect(result.data.transitioned).toEqual(['f1', 'f2', 'f3']);
	});

	it('[<100ms] reports the refused proposal by id and still transitions the other two', async () => {
		const { calls, ports } = unit(['f2']);
		const result = await revalidateBatch(ports, undefined);
		expect(result.data.transitioned).toEqual(['f1', 'f3']);
		expect(result.data.failed).toEqual([
			{ id: 'f2', reason: 'f2 refused' },
		]);
		expect(calls.undo).toBe(1);
	});

	it('[<100ms] calls the service once for a failing proposal, never retrying', async () => {
		const { calls, ports } = unit(['f2']);
		await revalidateBatch(ports, undefined);
		expect(calls.transitions.filter((t) => t.startsWith('f2'))).toEqual([
			'f2:in-progress',
		]);
	});

	it('[<100ms] publishes once for a batch of three proposals, with no title argument', async () => {
		const { calls, ports } = unit();
		await revalidateBatch(ports, undefined);
		expect(calls.publish).toEqual([[]]);
	});

	it('[<100ms] publishes nothing when every proposal failed', async () => {
		const { calls, ports } = unit(['f1', 'f2', 'f3']);
		await revalidateBatch(ports, undefined);
		expect(calls.publish).toEqual([]);
	});

	it('[<100ms] fails the command when the publication fails', async () => {
		const { ports } = unit();
		const result = await revalidateBatch(
			{ ...ports, publish: async () => ({ code: 2, error: 'refused' }) },
			undefined,
		);
		expect(result.code).not.toBe(0);
		expect(result.error).toBe('refused');
	});

	it('[<100ms] enters no unit when nothing is chosen', async () => {
		const { calls, ports } = unit();
		await revalidateBatch(
			{ ...ports, proposals: async () => [] },
			undefined,
		);
		expect(calls.enter).toBe(0);
	});
});

describe('revalidateBatch declared files', () => {
	const OLD = 'packages/a/old.ts';
	const NEW = 'packages/a/old.e2e.ts';
	const withFiles = (id = 'g1'): IRevalidateProposal =>
		proposal(id, [slice({ files: [OLD] })]);

	/** Ports where only the paths in `present` exist and `log` answers git. */
	const filesUnit = (
		present: readonly string[],
		log: (args: readonly string[]) => string,
	) => {
		const calls = {
			rewrites: [] as string[],
			transitions: [] as string[],
			reasons: [] as string[],
			supersededBy: [] as (string | undefined)[],
			lines: [] as string[],
		};
		const ports: IWorkRevalidatePorts = {
			...okPorts([{ ...withFiles(), file: 'docs/g1.md' }]),
			print: (line) => calls.lines.push(line),
			exists: (_worktree, path) => present.includes(path),
			git: (_worktree, args) => ({ ok: true, out: log(args) }),
			rewriteDeclared: ({ from, to }) => {
				calls.rewrites.push(`${from}>${to}`);
				return undefined;
			},
			transition: async ({ to, reason, supersededBy }) => {
				calls.transitions.push(to);
				calls.reasons.push(reason);
				calls.supersededBy.push(supersededBy);
				return { ok: true };
			},
		};
		return { calls, ports };
	};

	interface IFakeHistory {
		/** Commits that removed a path: git answers D for them under a pathspec. */
		readonly removed: Record<string, { sha: string; subject: string }>;
		/** The unlimited `git show -M` rows of a commit. */
		readonly shown?: Record<string, string>;
		/** The merge line (`sha<TAB>subject`) that brought a commit in. */
		readonly merge?: string;
	}

	const fakeGit =
		(history: IFakeHistory) =>
		(args: readonly string[]): string => {
			if (args[0] === 'show')
				return history.shown?.[args.at(-1) ?? ''] ?? '';
			if (args.includes('--merges')) return history.merge ?? '';
			const removal = history.removed[args.at(-1) ?? ''];
			return removal === undefined
				? ''
				: `${removal.sha}\t${removal.subject}\n`;
		};

	const RENAME_SHA = 'aaaaaaaaaaaa';
	const renamed: IFakeHistory = {
		removed: { [OLD]: { sha: RENAME_SHA, subject: 'name the specs e2e' } },
		shown: { [RENAME_SHA]: `R100\t${OLD}\t${NEW}\n` },
	};

	it('[<100ms] rewrites a path git reports as D under a pathspec but pairs as R in the commit', async () => {
		const { calls, ports } = filesUnit([NEW], fakeGit(renamed));
		const result = await revalidateBatch(ports, undefined);
		expect(calls.rewrites).toEqual([`${OLD}>${NEW}`]);
		expect(result.data.transitioned).toEqual(['g1']);
		expect(calls.transitions).toEqual(['in-progress', 'review']);
	});

	it('[<100ms] judges a rename whose target was later deleted as deleted', async () => {
		const { calls, ports } = filesUnit(
			[],
			fakeGit({
				removed: {
					...renamed.removed,
					[NEW]: {
						sha: 'bbbbbbbbbbbb',
						subject: 'delete it (x00001)',
					},
				},
				shown: renamed.shown ?? {},
			}),
		);
		const result = await revalidateBatch(ports, undefined);
		expect(calls.rewrites).toEqual([]);
		expect(result.data.retired).toEqual(['g1']);
	});

	it('[<100ms] leaves out and names a path git never knew', async () => {
		const { calls, ports } = filesUnit([], () => '');
		const result = await revalidateBatch(ports, undefined);
		expect(result.data.transitioned).toEqual([]);
		expect(result.data.refused[0]?.reason).toContain(
			`${OLD} is not known to git`,
		);
		expect(calls.transitions).toEqual([]);
	});

	const deletion = (subject: string, merge?: string): IFakeHistory => ({
		removed: { [OLD]: { sha: 'abc123456789', subject } },
		...(merge === undefined ? {} : { merge }),
	});

	it('[<100ms] retires a proposal whose files one proposal id deleted', async () => {
		const { calls, ports } = filesUnit(
			[],
			fakeGit(deletion('refactor(land): delete the queue (x00995)')),
		);
		const result = await revalidateBatch(ports, undefined);
		expect(result.data.retired).toEqual(['g1']);
		expect(result.data.failed).toEqual([]);
		expect(calls.transitions).toEqual(['retired']);
		expect(calls.supersededBy).toEqual(['x00995']);
		expect(calls.reasons[0]).toContain('abc123456');
	});

	it('[<100ms] reads the proposal id from the merge when the commit names none', async () => {
		const { calls, ports } = filesUnit(
			[],
			fakeGit(
				deletion(
					'delete the queue',
					'm1\tMerge pull request #9 from X/delendai/pr/a/implement/q00046-S4-g1/land',
				),
			),
		);
		const result = await revalidateBatch(ports, undefined);
		expect(calls.supersededBy).toEqual(['q00046']);
		expect(result.data.retired).toEqual(['g1']);
	});

	it('[<100ms] leaves out a deletion no commit or merge names, naming the commit', async () => {
		const { calls, ports } = filesUnit(
			[],
			fakeGit(deletion('delete the queue', 'm1\tMerge pull request #9')),
		);
		const result = await revalidateBatch(ports, undefined);
		expect(calls.transitions).toEqual([]);
		expect(result.data.refused[0]?.reason).toContain(
			`${OLD} was deleted by abc123456`,
		);
	});

	it('[<100ms] leaves out a deletion whose commit names two proposals', async () => {
		const { calls, ports } = filesUnit(
			[],
			fakeGit(deletion('delete the queue (x00995, x01015)')),
		);
		const result = await revalidateBatch(ports, undefined);
		expect(calls.transitions).toEqual([]);
		expect(result.data.retired).toEqual([]);
	});
});

describe('in-progress proposals', () => {
	const finished = (id: string, stage = 'in-progress') =>
		proposal(id, [slice({ reviewState: undefined })], stage);

	it('[<50ms] accepts a finished in-progress proposal no unit holds', () => {
		expect(revalidateRefusalOf(finished('i1'))).toBeUndefined();
	});

	it('[<50ms] accepts one whose slice lines say pending with no shipped-in, leaving delivery to the preflight', () => {
		const pending = proposal(
			'i2',
			[slice({ shippedIn: undefined, status: 'pending' })],
			'in-progress',
		);
		expect(revalidateRefusalOf(pending)).toBeUndefined();
	});

	it('[<50ms] refuses one a live unit holds, naming the unit', () => {
		expect(revalidateRefusalOf(finished('i3'), new Set(['i3']))).toContain(
			'a live unit holds it',
		);
	});

	it('[<100ms] hands an in-progress proposal over with review as its only step, a ready one in-progress then review', async () => {
		const steps: string[] = [];
		const ports: IWorkRevalidatePorts = {
			...okPorts([finished('i1'), proposal('r1', [slice()])]),
			transition: async ({ id, to }) => {
				steps.push(`${id}:${to}`);
				return { ok: true };
			},
		};
		const result = await revalidateBatch(ports, undefined);
		expect(result.data.transitioned).toEqual(['i1', 'r1']);
		expect(steps).toEqual(['i1:review', 'r1:in-progress', 'r1:review']);
	});

	it('[<100ms] leaves out and prints an in-progress proposal the preflight refuses, with no --proposals', async () => {
		const lines: string[] = [];
		const ports: IWorkRevalidatePorts = {
			...okPorts([finished('i1'), finished('i2')]),
			print: (line) => lines.push(line),
			handoverRefusal: async (id) =>
				id === 'i2' ? 'S2 is undelivered' : undefined,
		};
		const result = await revalidateBatch(ports, undefined);
		expect(result.data.transitioned).toEqual(['i1']);
		expect(lines).toContain('left out i2: S2 is undelivered');
	});

	it('[<100ms] prints a held in-progress proposal left out when no --proposals is given', async () => {
		const lines: string[] = [];
		const ports: IWorkRevalidatePorts = {
			...okPorts([finished('i3')]),
			print: (line) => lines.push(line),
			heldByUnits: async () => new Set(['i3']),
		};
		await revalidateBatch(ports, undefined);
		expect(lines).toContain('left out i3: a live unit holds it');
	});

	it('[<100ms] leaves a held proposal out of the batch', async () => {
		const ports: IWorkRevalidatePorts = {
			...okPorts([finished('i3')]),
			heldByUnits: async () => new Set(['i3']),
		};
		const result = await revalidateBatch(ports, 'i3');
		expect(result.data.refused).toEqual([
			{ id: 'i3', reason: 'a live unit holds it' },
		]);
		expect(result.data.chosen).toEqual([]);
	});
});

describe('declared paths', () => {
	const DOC = [
		'id: g1',
		'## slices',
		'### S1 — a',
		'- **Files**: `a/old.ts`, `a/b.ts`',
		'### S2 — b',
		'- **Files**: `a/old.ts`',
	].join('\n');

	it('[<50ms] parses the backticked paths of a Files line', () => {
		const read = parseRevalidateProposal(DOC, 'ready', 'docs/g1.md');
		expect(read?.file).toBe('docs/g1.md');
		expect(read?.slices[0]?.files).toEqual(['a/old.ts', 'a/b.ts']);
	});

	it('[<50ms] rewrites the path in the named slice only', () => {
		const next = rewriteDeclaredPath(DOC, 'S1', 'a/old.ts', 'a/new.ts');
		expect(next).toContain('`a/new.ts`, `a/b.ts`');
		expect(next?.split('\n').at(-1)).toBe('- **Files**: `a/old.ts`');
	});

	it('[<50ms] answers undefined when the slice does not declare the path', () => {
		expect(rewriteDeclaredPath(DOC, 'S1', 'zzz', 'y')).toBeUndefined();
		expect(rewriteDeclaredPath(DOC, 'S9', 'a/old.ts', 'y')).toBeUndefined();
	});

	it('[<100ms] refuses the proposal when the rewrite is refused', async () => {
		const ports: IWorkRevalidatePorts = {
			...okPorts([
				{
					...proposal('g1', [slice({ files: ['a/old.ts'] })]),
					file: 'docs/g1.md',
				},
			]),
			exists: (_w, path) => path === 'a/new.ts',
			git: (_w, args) => ({
				ok: true,
				out:
					args[0] === 'show'
						? 'R100\ta/old.ts\ta/new.ts\n'
						: 'aaaaaaaaaaaa\trename\n',
			}),
			rewriteDeclared: () => 'no',
		};
		const result = await revalidateBatch(ports, undefined);
		expect(result.data.failed).toEqual([{ id: 'g1', reason: 'no' }]);
	});
});

describe('readReadyProposals', () => {
	it('[<200ms] reads the ready proposals of a project and skips what has no id', async () => {
		const root = mkdtempSync(join(tmpdir(), 'revalidate-read-'));
		try {
			const dir = join(root, READY_PROPOSALS_DIR, 'feats');
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, 'f1-a.md'),
				'---\nid: f1\n---\n## slices\n### S1 — a\n- shipped-in: `abc`\n',
			);
			writeFileSync(join(dir, 'note.md'), 'no frontmatter');
			writeFileSync(join(dir, 'x.txt'), 'ignored');
			const read = await readReadyProposals(root);
			expect(read.map((proposal) => proposal.id)).toEqual(['f1']);
			expect(await readReadyProposals(join(root, 'none'))).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
