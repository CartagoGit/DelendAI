import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	journalProposalTransition,
	journalReviewSubmission,
} from '../../../../src/lib/tools/proposal-work-events';

interface IJournalLine {
	readonly work_item_id: string;
	readonly actor_id: string | null;
	readonly kind: string;
}

describe('proposal work events', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'proposal-work-events-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const lines = async (): Promise<readonly IJournalLine[]> =>
		(
			await readFile(
				join(
					root,
					'.cache/delendai/telemetry/work-event-journal.ndjson',
				),
				'utf8',
			)
		)
			.trim()
			.split('\n')
			.map((text) => JSON.parse(text) as IJournalLine);

	it('journals a status change against the whole proposal', async () => {
		await journalProposalTransition(
			root,
			'q1',
			'ready',
			'in-progress',
			'a',
		);
		expect(await lines()).toMatchObject([
			{
				work_item_id: 'q1/all',
				actor_id: 'a',
				kind: 'proposal_transition',
			},
		]);
	});

	it('journals a review submission against its slice', async () => {
		await journalReviewSubmission(root, 'q1', 'S2', undefined);
		expect(await lines()).toMatchObject([
			{ work_item_id: 'q1/S2', actor_id: null, kind: 'slice_submitted' },
		]);
	});
});
