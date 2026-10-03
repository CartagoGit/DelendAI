import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	readHostLifecycleEvents,
	summarizeHostLifecycle,
} from '../../../src/lib/host-lifecycle';
import type { IInvocationRecord } from '../../../src/lib/types';

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const invocation = (sessionId: string): IInvocationRecord => ({
	ts: '2026-07-24T10:01:00.000Z',
	sessionId,
	agent: { id: 'claude', kind: 'claude-code', extension: 'claude-code' },
	plugin: 'usage-tracking',
	tool: 'session_hygiene',
	model: null,
	usage: null,
	costUsd: null,
	durationMs: null,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed: false,
});

describe('host lifecycle observations', () => {
	it('skips malformed rows and summarises only lifecycle metadata', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'host-lifecycle-'));
		dirs.push(dir);
		const path = join(dir, 'events.jsonl');
		writeFileSync(
			path,
			[
				JSON.stringify({
					version: 1,
					host: 'claude-code',
					hostSessionId: 'host-s',
					event: 'turn',
					at: '2026-07-24T10:00:00.000Z',
				}),
				'{not-json',
				JSON.stringify({
					version: 1,
					host: 'claude-code',
					hostSessionId: 'host-s',
					event: 'pre-compact',
					at: '2026-07-24T10:02:00.000Z',
				}),
				JSON.stringify({
					version: 1,
					host: 'claude-code',
					hostSessionId: 'host-s',
					event: 'post-compact',
					at: '2026-07-24T10:03:00.000Z',
				}),
			].join('\n'),
			'utf8',
		);

		const events = await readHostLifecycleEvents(path);
		expect(events).toHaveLength(3);
		expect(summarizeHostLifecycle(events, [invocation('host-s')])).toEqual([
			expect.objectContaining({
				hostSessionId: 'host-s',
				turnCount: 1,
				preCompactCount: 1,
				postCompactCount: 1,
				explicitMcpSessionIdMatch: true,
				matchingMcpCalls: 1,
			}),
		]);
	});

	it('does not infer a correlation when the opaque ids differ', () => {
		const result = summarizeHostLifecycle(
			[
				{
					version: 1,
					host: 'claude-code',
					hostSessionId: 'host-s',
					event: 'session-end',
					at: '2026-07-24T10:00:00.000Z',
				},
			],
			[invocation('mcp-boot-s')],
		);
		expect(result[0]).toMatchObject({
			explicitMcpSessionIdMatch: false,
			matchingMcpCalls: 0,
		});
	});
});
