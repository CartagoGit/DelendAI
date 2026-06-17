import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';

import {
	buildStateHealthRegistration,
	buildStateRepairRegistration,
	type IStateToolOptions,
} from '@cartago-git/mcp-proposals/lib/tools/state-tools.tool';

const capture = async (
	reg: IToolRegistration
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('state_health / state_repair [N15]', () => {
	let dir = '';
	let opts: IStateToolOptions;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'state-'));
		opts = {
			namespacePrefix: 'proposals',
			lockPathAbs: join(dir, '.cache/agents.lock.json'),
			queuePathAbs: join(dir, '.cache/agent-queue/queue.json'),
			closedTasksPathAbs: join(dir, '.cache/agent-queue/closed-tasks.json'),
			registryPathAbs: join(dir, '.cache/agent-registry.json'),
			workspaceRoot: dir,
		};
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('reports healthy on an empty workspace', async () => {
		const handler = await capture(buildStateHealthRegistration(opts));
		const out = parse(await handler({}));
		expect(out.healthy).toBe(true);
		expect(out.locks.active).toBe(0);
		expect(out.registry.orphans).toBe(0);
	});

	it('flags a stale lock and repairs it on execute', async () => {
		// A claim whose last_seen is far in the past → stale.
		mkdirSync(dirname(opts.lockPathAbs), { recursive: true });
		writeFileSync(
			opts.lockPathAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: [
					{
						task_id: 't-old',
						agent: 'falcon',
						ownership: ['src/a.ts'],
						started_at: '2000-01-01T00:00:00.000Z',
						last_seen: '2000-01-01T00:00:00.000Z',
					},
				],
			})
		);

		const repair = await capture(buildStateRepairRegistration(opts));
		const dry = parse(await repair({}));
		expect(dry.mode).toBe('dry-run');

		const exec = parse(await repair({ mode: 'execute' }));
		expect(exec.mode).toBe('execute');
		expect(exec.repaired.staleLocks).toBeGreaterThanOrEqual(1);
		expect(exec.diagnosis.locks.active).toBe(0);
	});
});
