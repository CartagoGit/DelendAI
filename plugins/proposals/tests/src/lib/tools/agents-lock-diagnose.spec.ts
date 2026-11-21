import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __testOnly } from '@delendai/proposals/lib/tools/agents-lock-diagnose.tool';

const now = Date.now();

describe('agents_lock_diagnose', () => {
	let root = '';
	let lockPath = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'agents-lock-diagnose-'));
		lockPath = join(root, 'agents.lock.json');
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns zombie entries when started_at == last_seen and age > 30s', async () => {
		const staleTs = new Date(now - 45_000).toISOString();
		writeFileSync(
			lockPath,
			JSON.stringify(
				{
					version: 1,
					stale_after_minutes: 10,
					in_flight: [
						{
							task_id: 'task-zombie',
							agent: 'agent-a',
							ownership: ['plugins/proposals/src/index.ts'],
							started_at: staleTs,
							last_seen: staleTs,
						},
					],
				},
				null,
				'\t',
			),
		);

		const logsDir = join(root, 'results', 'logs');
		mkdirSync(logsDir, { recursive: true });
		writeFileSync(
			join(logsDir, '2026-07-25.jsonl'),
			`${JSON.stringify({
				ts: new Date(now - 50_000).toISOString(),
				taskId: 'task-zombie',
			})}\n`,
			'utf8',
		);

		const result = await __testOnly.diagnoseAgentsLock({
			namespacePrefix: 'proposals',
			lockPathAbs: lockPath,
			lockFileLabel: 'agents.lock.json',
		});

		expect(result.ok).toBe(true);
		expect(result.zombies).toHaveLength(1);
		expect(result.zombies[0]?.task_id).toBe('task-zombie');
		expect(result.logGaps).toHaveLength(1);
		expect(result.logGaps[0]?.task_id).toBe('task-zombie');
		expect(result.logGaps[0]?.gap_seconds).toBe(5);
	});

	it('computes log gaps from the most recent matching task log', () => {
		const zombie = __testOnly.toZombie(
			{
				task_id: 'task-gap',
				agent: 'agent-b',
				ownership: ['a.ts'],
				started_at: '2026-07-25T04:00:45.000Z',
				last_seen: '2026-07-25T04:00:45.000Z',
			},
			Date.parse('2026-07-25T04:01:30.000Z'),
		);

		expect(
			__testOnly.buildLogGaps(
				[zombie],
				new Map([['task-gap', '2026-07-25T04:00:15.000Z']]),
			),
		).toEqual([
			{
				task_id: 'task-gap',
				lock_last_seen: '2026-07-25T04:00:45.000Z',
				latest_log_ts: '2026-07-25T04:00:15.000Z',
				gap_seconds: 30,
			},
		]);
	});
});
