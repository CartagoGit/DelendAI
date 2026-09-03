import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	appendClaudeLifecycleRow,
	parseOptions,
	toClaudeLifecycleRow,
} from './record-lifecycle.script';

const created: string[] = [];

afterEach(async () => {
	await Promise.all(
		created
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe('record-claude-lifecycle', () => {
	it('keeps only the opaque session id and lifecycle event', () => {
		const row = toClaudeLifecycleRow(
			{
				session_id: 'claude-session-123',
				hook_event_name: 'PreCompact',
				prompt: 'this must never be persisted',
				transcript_path: '/private/transcript.jsonl',
			},
			new Date('2026-07-24T12:00:00.000Z'),
		);
		expect(row).toEqual({
			version: 1,
			host: 'claude-code',
			hostSessionId: 'claude-session-123',
			event: 'pre-compact',
			at: '2026-07-24T12:00:00.000Z',
		});
	});

	it('rejects unsupported hook events and invalid session ids', () => {
		expect(
			toClaudeLifecycleRow({
				session_id: 's',
				hook_event_name: 'Notification',
			}),
		).toBeNull();
		expect(
			toClaudeLifecycleRow({ hook_event_name: 'PostCompact' }),
		).toBeNull();
	});

	it('contains the lifecycle destination inside the supplied workspace', () => {
		expect(parseOptions(['--workspace=/tmp/project'])).toMatchObject({
			workspace: '/tmp/project',
			lifecyclePath:
				'/tmp/project/.cache/mcp-vertex/results/usage-tracking/host-lifecycle.claude-code.jsonl',
		});
		expect(
			parseOptions([
				'--workspace=/tmp/project',
				'--lifecycle-path=../../outside.jsonl',
			]),
		).toBeNull();
	});

	it('serializes a redacted lifecycle row as one NDJSON line', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'claude-lifecycle-'));
		created.push(dir);
		const path = join(dir, 'nested', 'events.jsonl');
		await appendClaudeLifecycleRow(path, {
			version: 1,
			host: 'claude-code',
			hostSessionId: 's',
			event: 'turn',
			at: '2026-07-24T12:00:00.000Z',
		});
		expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
			hostSessionId: 's',
			event: 'turn',
		});
	});
});
