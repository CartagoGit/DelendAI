import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	resolvedStrandings,
	scanReadyToClose,
	unbaselinedStrandings,
	type IReadyToCloseFinding,
	byDrift,
	measureReviewDrift,
	type IReviewGitFacts,
} from './proposal-ready-to-close.script';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const proposal = (
	id: string,
	status: string,
	slices: readonly string[],
	extraFrontmatter = '',
): string =>
	[
		'---',
		`id: ${id}`,
		`title: "${id} demo"`,
		'kind: fix',
		`status: ${status}`,
		'type: proposal',
		extraFrontmatter,
		'---',
		'',
		'## Slices',
		'',
		...slices.flatMap((sliceStatus, index) => [
			`### S${String(index + 1)} — slice ${String(index + 1)}`,
			'',
			`- **Status**: ${sliceStatus}`,
			'',
		]),
	]
		.filter((line) => line !== '')
		.join('\n');

const workspace = (
	files: ReadonlyArray<{ folder: string; name: string; body: string }>,
): string => {
	const root = mkdtempSync(join(tmpdir(), 'ready-to-close-'));
	roots.push(root);
	for (const file of files) {
		const dir = join(root, file.folder);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, file.name), file.body, 'utf8');
	}
	return root;
};

const finding = (
	proposalId: string,
	stranded: boolean,
): IReadyToCloseFinding => ({
	relPath: `docs/${proposalId}.md`,
	folder: stranded ? 'ready' : 'review',
	stranded,
	proposalId,
	totalSlices: 1,
	doneSlices: 1,
	shippedInState: 'missing',
	nextAction: '',
});

describe('proposal-ready-to-close — scanning', () => {
	/**
	 * The regression this spec exists for. The private parser this script
	 * used to carry required the status to be a single word ending the
	 * line, so a slice that explains itself — the house style for
	 * evidence — counted as no slice at all, and the proposal was skipped
	 * as unfinished. Three stranded proposals were invisible, including
	 * one an external audit named.
	 */
	it('counts a slice whose status carries its evidence', () => {
		const root = workspace([
			{
				folder: 'ready/fixes',
				name: 'x00001-demo.md',
				body: proposal('x00001', 'ready', [
					'done — shipped in `deadbee`, proven both ways',
					'done, over the warning — measured at 10,577 B',
				]),
			},
		]);
		const findings = scanReadyToClose(root);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.doneSlices).toBe(2);
		expect(findings[0]?.totalSlices).toBe(2);
		expect(findings[0]?.stranded).toBe(true);
	});

	/**
	 * `review -> done` is the legal closing hop, so a finished proposal
	 * waiting there waits correctly — on a DIFFERENT agent's approval.
	 * `ready` has no edge to `done` at all.
	 */
	it('reports a finished proposal in review/ without calling it stranded', () => {
		const root = workspace([
			{
				folder: 'review',
				name: 'x00002-demo.md',
				body: proposal('x00002', 'review', ['done', 'done']),
			},
		]);
		const findings = scanReadyToClose(root);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.stranded).toBe(false);
		expect(findings[0]?.folder).toBe('review');
	});

	it('ignores a proposal that still has unfinished slices', () => {
		const root = workspace([
			{
				folder: 'ready/fixes',
				name: 'x00003-demo.md',
				body: proposal('x00003', 'ready', ['done', 'pending']),
			},
		]);
		expect(scanReadyToClose(root)).toHaveLength(0);
	});

	it('reads shipped-in from the frontmatter', () => {
		const root = workspace([
			{
				folder: 'ready/fixes',
				name: 'x00004-demo.md',
				body: proposal(
					'x00004',
					'ready',
					['done'],
					'shipped-in:\n    - deadbee',
				),
			},
		]);
		expect(scanReadyToClose(root)[0]?.shippedInState).toBe('ok');
	});
});

describe('proposal-ready-to-close — the ratchet', () => {
	it('passes a stranding the baseline already records', () => {
		expect(
			unbaselinedStrandings([finding('x00543', true)], ['x00543']),
		).toHaveLength(0);
	});

	it('fails a stranding the baseline does not record', () => {
		const fresh = unbaselinedStrandings(
			[finding('x00543', true), finding('x00999', true)],
			['x00543'],
		);
		expect(fresh.map((f) => f.proposalId)).toEqual(['x00999']);
	});

	it('never counts a review-stage proposal as a new stranding', () => {
		expect(unbaselinedStrandings([finding('f00516', false)], [])).toEqual(
			[],
		);
	});

	it('names a baselined proposal that is no longer stranded', () => {
		expect(
			resolvedStrandings([finding('x00543', true)], ['x00543', 'q00014']),
		).toEqual(['q00014']);
	});
});

describe('review age and drift (f00640 S1)', () => {
	const DAY = 86_400_000;
	const git = (over: Partial<IReviewGitFacts> = {}): IReviewGitFacts => ({
		commitTimeMs: (sha) => (sha === 'abc1234' ? 10 * DAY : undefined),
		commitsSince: () => 40,
		filesTouchedSince: (_sha, files) => files.slice(0, 1),
		...over,
	});

	it('measures age, commits since and the files rewritten since the work landed', () => {
		expect(
			measureReviewDrift({
				shippedIn: ['abc1234'],
				files: ['a.ts', 'b.ts'],
				nowMs: 13 * DAY,
				git: git(),
			}),
		).toEqual({
			measured: true,
			reviewAgeDays: 3,
			commitsSince: 40,
			filesTouchedSince: ['a.ts'],
			files: 2,
			driftRatio: 0.5,
		});
	});

	it('measures from the latest shipped-in commit git knows', () => {
		const drift = measureReviewDrift({
			shippedIn: ['abc1234', 'def5678', 'unknown'],
			files: ['a.ts'],
			nowMs: 20 * DAY,
			git: git({
				commitTimeMs: (sha) =>
					sha === 'abc1234'
						? 10 * DAY
						: sha === 'def5678'
							? 18 * DAY
							: undefined,
			}),
		});
		expect(drift.measured && drift.reviewAgeDays).toBe(2);
	});

	it('is unmeasurable, never fresh, when no shipped-in commit is known', () => {
		expect(
			measureReviewDrift({
				shippedIn: ['0000000'],
				files: ['a.ts'],
				nowMs: DAY,
				git: git(),
			}),
		).toEqual({
			measured: false,
			reason: 'no shipped-in commit is known to this clone',
		});
	});

	it('orders the most drifted first and the unmeasurable last', () => {
		const drifted = measureReviewDrift({
			shippedIn: ['abc1234'],
			files: ['a.ts'],
			nowMs: 11 * DAY,
			git: git(),
		});
		const untouched = measureReviewDrift({
			shippedIn: ['abc1234'],
			files: ['a.ts'],
			nowMs: 11 * DAY,
			git: git({ filesTouchedSince: () => [] }),
		});
		const unknown = { measured: false, reason: 'x' } as const;
		expect(
			[unknown, untouched, drifted]
				.sort(byDrift)
				.map((d) => (d.measured ? d.driftRatio : 'unmeasurable')),
		).toEqual([1, 0, 'unmeasurable']);
	});
});
