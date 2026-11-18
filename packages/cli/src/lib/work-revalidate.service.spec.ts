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
	proposal('f4', [slice()], 'in-progress'),
	proposal('f5', [
		slice(),
		slice({ id: 'S2', status: 'retired', shippedIn: undefined }),
	]),
];

const okPorts = (
	proposals: readonly IRevalidateProposal[],
): IWorkRevalidatePorts => ({
	proposals: async () => proposals,
	print: () => undefined,
	enter: async () => '/unit',
	developSha: async () => 'abcdef0123456789',
	mark: () => 'mark',
	undo: () => undefined,
	transition: async () => ({ ok: true }),
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
		const calls = { enter: 0, undo: 0, transitions: [] as string[] };
		const ports: IWorkRevalidatePorts = {
			proposals: async () => THREE,
			print: () => undefined,
			enter: async () => {
				calls.enter += 1;
				return '/unit';
			},
			developSha: async () => 'abcdef0123456789',
			mark: () => 'mark',
			undo: () => {
				calls.undo += 1;
			},
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

	it('[<100ms] enters no unit when nothing is chosen', async () => {
		const { calls, ports } = unit();
		await revalidateBatch(
			{ ...ports, proposals: async () => [] },
			undefined,
		);
		expect(calls.enter).toBe(0);
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
