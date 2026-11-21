import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	interruptOrphans,
	invocationJournalAt,
	latestByInvocation,
	readJournal,
} from '../../../../src/lib/services/invocation-journal.service';

const journalPath = () =>
	join(
		mkdtempSync(join(tmpdir(), 'invocation-journal-')),
		'invocations.jsonl',
	);

const line = (invocationId: string, state: string, pid: number, at: string) =>
	JSON.stringify({ invocationId, state, providerId: 'p', pid, at });

describe('the invocation journal service', () => {
	it('appends each entry with when and by which process', async () => {
		const path = journalPath();
		const journal = invocationJournalAt(
			path,
			() => new Date('2026-10-17T10:00:00.000Z'),
		);
		await journal({ invocationId: 'a', providerId: 'p', state: 'running' });
		await journal({
			invocationId: 'a',
			providerId: 'p',
			state: 'completed',
		});
		const latest = latestByInvocation(await readJournal(path)).get('a');
		expect(latest).toMatchObject({
			state: 'completed',
			at: '2026-10-17T10:00:00.000Z',
			pid: process.pid,
		});
	});

	it('ends as interrupted a running hop whose process is gone, and leaves a live one', async () => {
		const path = journalPath();
		writeFileSync(
			path,
			`${[
				line('dead', 'running', 111, '2026-10-17T09:00:00.000Z'),
				line('live', 'running', 222, '2026-10-17T09:01:00.000Z'),
				line('done', 'running', 111, '2026-10-17T09:02:00.000Z'),
				line('done', 'completed', 111, '2026-10-17T09:03:00.000Z'),
				'not json',
			].join('\n')}\n`,
		);
		const ended = await interruptOrphans(path, (pid) => pid === 222);
		expect(ended).toBe(1);
		const latest = latestByInvocation(await readJournal(path));
		expect(latest.get('dead')?.state).toBe('interrupted');
		expect(latest.get('dead')?.detail).toContain(
			'(111) ended before it did',
		);
		expect(latest.get('live')?.state).toBe('running');
		expect(latest.get('done')?.state).toBe('completed');
	});

	it('changes nothing when no hop was orphaned', async () => {
		const path = journalPath();
		const text = `${line('a', 'completed', 1, '2026-10-17T09:00:00.000Z')}\n`;
		writeFileSync(path, text);
		expect(await interruptOrphans(path, () => false)).toBe(0);
		expect(await readJournal(path)).toHaveLength(1);
	});
});
