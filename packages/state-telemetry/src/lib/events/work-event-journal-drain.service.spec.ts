import {
	access,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { INewWorkEvent } from './work-event';
import { drainWorkEventJournal } from './work-event-journal-drain.service';

const validLine = JSON.stringify({
	work_item_id: 'q00020/S1',
	actor_id: 'claude-sonnet-5-5',
	kind: 'slice_claimed',
	payload_hash: 'abc',
	created_at: 10,
});

describe('drainWorkEventJournal', () => {
	let dir: string;
	let journal: string;
	let seen: INewWorkEvent[];
	const sink = {
		append: async (event: INewWorkEvent): Promise<void> => {
			seen.push(event);
		},
	};

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'drain-'));
		journal = join(dir, 'work-event-journal.ndjson');
		seen = [];
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('appends each valid line to the bus and removes the journal', async () => {
		await writeFile(journal, `${validLine}\n${validLine}\n`);
		const result = await drainWorkEventJournal(sink, journal);
		expect(result).toEqual({ appended: 2, skipped: 0, retained: 0 });
		expect(seen[0]).toMatchObject({
			work_item_id: 'q00020/S1',
			kind: 'slice_claimed',
			created_at: 10,
		});
		await expect(access(journal)).rejects.toThrow();
		expect((await readdir(dir)).length).toBe(0);
	});

	it('skips garbage and unknown kinds, and keeps what the bus refuses', async () => {
		const unknown = JSON.stringify({
			...JSON.parse(validLine),
			kind: 'nope',
		});
		await writeFile(journal, `not json\n${unknown}\n${validLine}\n`);
		const refusing = {
			append: async (): Promise<void> => {
				throw new Error('closed');
			},
		};
		expect(await drainWorkEventJournal(refusing, journal)).toEqual({
			appended: 0,
			skipped: 2,
			retained: 1,
		});
		// A transient failure keeps the event for the next drain.
		expect(await readFile(journal, 'utf8')).toBe(`${validLine}\n`);
		expect((await drainWorkEventJournal(sink, journal)).appended).toBe(1);
	});

	it('does nothing when there is no journal', async () => {
		expect(await drainWorkEventJournal(sink, journal)).toEqual({
			appended: 0,
			skipped: 0,
			retained: 0,
		});
	});

	it('takes up a claim a crashed drain left behind', async () => {
		await writeFile(`${journal}.draining`, `${validLine}\n`);
		await writeFile(journal, `${validLine}\n`);
		expect((await drainWorkEventJournal(sink, journal)).appended).toBe(1);
		// The live journal is still there for the next drain.
		expect(await readFile(journal, 'utf8')).toContain('q00020/S1');
		expect((await drainWorkEventJournal(sink, journal)).appended).toBe(1);
	});

	it('leaves the claim of a live drain alone and adopts that of a dead one', async () => {
		const live = `${journal}.draining.${process.pid}.11111111-1111-1111-1111-111111111111`;
		await writeFile(live, `${validLine}\n`);
		expect((await drainWorkEventJournal(sink, journal)).appended).toBe(0);
		expect(await readFile(live, 'utf8')).toContain('q00020/S1');
		// No pid this high runs: the max on Linux is 2^22.
		const dead = `${journal}.draining.99999999.22222222-2222-2222-2222-222222222222`;
		await writeFile(dead, `${validLine}\n`);
		expect((await drainWorkEventJournal(sink, journal)).appended).toBe(1);
		await expect(access(dead)).rejects.toThrow();
	});
});
