/**
 * work-status.service.spec.ts — the status view is computed from the
 * proposals and the events alone.
 */
import { describe, expect, it } from 'vitest';

import { asWorkItemId, type IWorkEvent } from '../events/work-event';
import {
	activeAgents,
	buildWorkStatus,
	renderWorkStatus,
	workItemsOf,
} from './work-status.service';

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

const proposal = {
	id: 'f00001',
	title: 'A thing',
	markdown: [
		'## slices',
		'',
		'### S1 — first',
		'- **Status**: done',
		'- acceptance:',
		'  - "one"',
		'  - "two"',
		'',
		'### S2 — second',
		'- **Status**: in-progress',
		'- acceptance:',
		'  - "one"',
		'',
		'### S3 — dropped',
		'- **Status**: retired',
		'',
	].join('\n'),
};

const event = (
	item: string,
	kind: IWorkEvent['kind'],
	actor: string,
	minutesAgo: number,
): IWorkEvent => ({
	work_item_id: asWorkItemId(item),
	actor_id: actor,
	kind,
	payload_hash: 'h',
	created_at: NOW - minutesAgo * MINUTE,
});

describe('workItemsOf', () => {
	it('reads each slice with its status and acceptance, leaving retired ones out', () => {
		expect(workItemsOf(proposal)).toEqual([
			{
				workItemId: 'f00001/S1',
				acceptanceCount: 2,
				acceptanceDone: 2,
				status: 'done',
			},
			{
				workItemId: 'f00001/S2',
				acceptanceCount: 1,
				acceptanceDone: 0,
				status: 'in-progress',
			},
		]);
	});
});

describe('buildWorkStatus', () => {
	it('gives one row per proposal, between nothing and everything done', () => {
		const [row] = buildWorkStatus({
			proposals: [proposal],
			events: [event('f00001/S2', 'slice_claimed', 'agent-a', 5)],
			now: NOW,
		});
		expect(row?.proposalId).toBe('f00001');
		expect(row?.slices).toBe(2);
		expect(row?.progress).toBeGreaterThan(0);
		expect(row?.progress).toBeLessThan(100);
		expect(row?.phase).not.toBe('done');
		expect(row?.lastEventAt).toBe(NOW - 5 * MINUTE);
	});

	it('ignores events of work it was not asked about, and proposals without slices', () => {
		expect(
			buildWorkStatus({
				proposals: [
					{ id: 'q00002', title: 'A plan', markdown: 'no slices' },
				],
				events: [event('zzz/S1', 'slice_claimed', 'agent-a', 1)],
				now: NOW,
			}),
		).toEqual([]);
	});
});

describe('what the document says about a slice', () => {
	const delivered = {
		id: 'f00002',
		title: 'Delivered',
		markdown: [
			'### S1 — a',
			'- **Status**: review',
			'- acceptance:',
			'  - "one"',
			'### S2 — b',
			'- **Status**: review',
			'',
		].join('\n'),
	};

	it('counts a slice handed to review as delivered and under review, with no event', () => {
		const [row] = buildWorkStatus({
			proposals: [delivered],
			events: [],
			now: NOW,
		});
		expect(row?.progress).toBe(100);
		expect(row?.phase).toBe('reviewing');
	});
});

describe('activeAgents', () => {
	it('lists each agent once, by its latest event, inside the window', () => {
		expect(
			activeAgents(
				[
					event('f00001/S2', 'slice_claimed', 'agent-a', 20),
					event('f00001/S2', 'slice_submitted', 'agent-a', 3),
					event('f00001/S1', 'slice_claimed', 'agent-b', 300),
				],
				NOW,
			),
		).toEqual([
			{
				agentId: 'agent-a',
				workItemId: 'f00001/S2',
				lastKind: 'slice_submitted',
				lastEventAt: NOW - 3 * MINUTE,
			},
		]);
	});
});

describe('renderWorkStatus', () => {
	it('draws the same lines for the same input', () => {
		const input = {
			proposals: [proposal],
			events: [event('f00001/S2', 'slice_claimed', 'agent-a', 5)],
			now: NOW,
		};
		const draw = () =>
			renderWorkStatus(
				buildWorkStatus(input),
				activeAgents(input.events, NOW),
				NOW,
			);
		expect(draw()).toBe(draw());
		expect(draw()).toContain('f00001');
		expect(draw()).toContain('agent-a');
		expect(draw()).toContain('5m ago');
	});

	it('says so when there is nothing to show', () => {
		expect(renderWorkStatus([], [], NOW)).toContain(
			'No open proposal has slices to show.',
		);
	});
});
