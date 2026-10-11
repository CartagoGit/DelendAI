import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	collectCompactStatus,
	describeSetAside,
	type ICompactStatusOptions,
} from '@delendai/proposals/lib/tools/compact-status.tool';

describe('compact_status (N17) — aggregates the proposals plugin state', async () => {
	let dir = '';
	let opts: ICompactStatusOptions;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'compact-'));
		opts = {
			namespacePrefix: 'proposals',
			lockPathAbs: join(dir, 'agents.lock.json'),
			queuePathAbs: join(dir, 'queue.json'),
			closedTasksPathAbs: join(dir, 'closed.json'),
			indexPathAbs: join(dir, 'index.json'),
		};
		writeFileSync(opts.closedTasksPathAbs, JSON.stringify([]));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('returns zeros/empty when nothing exists', async () => {
		const s = await collectCompactStatus(opts);
		expect(s.locks?.active).toBe(0);
		expect(s.queue?.queued).toBe(0);
		expect(s.proposals?.total).toBe(0);
		// Zero is said, not left out: an absent field could not be told
		// from a status that never looked.
		expect(s.proposals?.setAside).toEqual({ count: 0 });
	});

	it('counts active locks, queue backpressure and proposals by status', async () => {
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				in_flight: [
					{
						task_id: 't1',
						agent: 'a',
						ownership: ['x'],
						started_at: 'now',
					},
				],
			}),
		);
		writeFileSync(
			opts.indexPathAbs,
			JSON.stringify({
				proposals: [
					{ id: 'p1', status: 'in_progress' },
					{ id: 'p2', status: 'done' },
					{ id: 'p3', status: 'ready' },
				],
			}),
		);
		const s = await collectCompactStatus(opts);
		expect(s.locks?.active).toBe(1);
		expect(s.proposals?.total).toBe(3);
		expect(s.proposals?.actionable).toBe(2); // in_progress + ready
		expect(s.proposals?.byStatus.done).toBe(1);
	});

	it('honours the fields selector (low-token)', async () => {
		const s = await collectCompactStatus(opts, ['locks']);
		expect(s.locks).toBeDefined();
		expect(s.queue).toBeUndefined();
		expect(s.proposals).toBeUndefined();
	});

	it('tolerates a torn index (no throw)', async () => {
		writeFileSync(opts.indexPathAbs, '{ not json');
		const s = await collectCompactStatus(opts, ['proposals']);
		expect(s.proposals?.total).toBe(0);
	});
});

describe('the files a rebuild set aside, as the status reports them', () => {
	it('counts them and names the first with its reason', () => {
		expect(
			describeSetAside([
				{ path: 'ready/a.md', reason: 'frontmatter.kind is missing' },
				{ path: 'ready/b.md', reason: 'duplicate id' },
			]),
		).toEqual({
			count: 2,
			first: 'ready/a.md: frontmatter.kind is missing',
		});
	});

	it('reports none as zero, with nothing to name', () => {
		expect(describeSetAside([])).toEqual({ count: 0 });
	});
});
