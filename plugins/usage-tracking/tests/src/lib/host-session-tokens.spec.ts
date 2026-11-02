import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	claudeProjectDirName,
	claudeProjectsDir,
	meterSession,
	meterSessions,
	meterTranscript,
} from '../../../src/lib/services/host-session-tokens.service';

const call = (
	id: string,
	at: string,
	use: [number, number, number, number],
) => ({
	type: 'assistant',
	timestamp: at,
	uuid: `u-${id}-${at}`,
	message: {
		id,
		role: 'assistant',
		usage: {
			input_tokens: use[0],
			cache_creation_input_tokens: use[1],
			cache_read_input_tokens: use[2],
			output_tokens: use[3],
		},
	},
});
const prompt = {
	type: 'user',
	timestamp: '2026-11-01T10:00:00Z',
	message: { role: 'user', content: '  do   the\n task ' },
};
const write = (path: string, rows: readonly unknown[], raw = ''): void =>
	writeFileSync(
		path,
		rows.map((r) => JSON.stringify(r)).join('\n') + '\n' + raw,
	);

describe('host session tokens', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'host-sessions-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('names the transcript folder of a workspace', () => {
		expect(claudeProjectDirName('/home/a/_p/x')).toBe('-home-a--p-x');
		expect(claudeProjectsDir('/a/b', '/h')).toBe(
			'/h/.claude/projects/-a-b',
		);
	});

	it('counts a streamed message once and reports context', async () => {
		const path = join(dir, 's.jsonl');
		write(
			path,
			[
				prompt,
				call('m1', '2026-11-01T10:01:00Z', [1, 100, 0, 5]),
				call('m1', '2026-11-01T10:01:01Z', [1, 100, 0, 5]),
				call('m2', '2026-11-01T10:02:00Z', [2, 0, 300, 7]),
				call('m3', '2026-11-01T10:03:00Z', [3, 0, 500, 9]),
			],
			'not json\n',
		);
		const use = await meterTranscript(path);
		expect(use).toMatchObject({
			calls: 3,
			input: 6,
			cacheWrite: 100,
			cacheRead: 800,
			output: 21,
			contextMedian: 302,
			contextMax: 503,
			first: '2026-11-01T10:01:00Z',
			last: '2026-11-01T10:03:00Z',
			prompt: 'do the task',
		});
	});

	it('measures only the calls inside a window', async () => {
		const path = join(dir, 's.jsonl');
		write(path, [
			call('a', '2026-11-01T10:00:00Z', [1, 0, 0, 1]),
			call('b', '2026-11-01T11:00:00Z', [1, 0, 0, 2]),
			call('c', '2026-11-01T12:00:00Z', [1, 0, 0, 4]),
		]);
		const use = await meterTranscript(path, {
			from: '2026-11-01T10:30:00Z',
			to: '2026-11-01T11:30:00Z',
		});
		expect(use.calls).toBe(1);
		expect(use.output).toBe(2);
		expect((await meterTranscript(path, { to: '2026-11-01' })).calls).toBe(
			3,
		);
		expect(
			(await meterTranscript(path, { from: '2026-11-02' })).calls,
		).toBe(0);
	});

	it('splits the main thread from each subagent', async () => {
		const main = join(dir, 'sess.jsonl');
		write(main, [call('a', '2026-11-01T10:00:00Z', [1, 0, 0, 1])]);
		mkdirSync(join(dir, 'sess', 'subagents'), { recursive: true });
		write(join(dir, 'sess', 'subagents', 'agent-x.jsonl'), [
			prompt,
			call('s1', '2026-11-01T10:05:00Z', [0, 0, 10, 3]),
		]);
		write(join(dir, 'sess', 'subagents', 'agent-empty.jsonl'), [prompt]);
		const got = await meterSession(main);
		expect(got.session).toBe('sess');
		expect(got.main.calls).toBe(1);
		expect(got.subagents.map((s) => [s.id, s.calls, s.cacheRead])).toEqual([
			['agent-x', 1, 10],
		]);
	});

	it('lists sessions, scoped by session id and by since', async () => {
		write(join(dir, 'one.jsonl'), [
			call('a', '2026-11-01T10:00:00Z', [1, 0, 0, 1]),
		]);
		write(join(dir, 'two.jsonl'), [
			call('b', '2026-11-01T10:00:00Z', [1, 0, 0, 1]),
		]);
		expect(await meterSessions(dir)).toHaveLength(2);
		const one = await meterSessions(dir, { session: 'one' });
		expect(one.map((s) => s.session)).toEqual(['one']);
		expect(await meterSessions(dir, { from: '2999-01-01' })).toHaveLength(
			0,
		);
		expect(await meterSessions(join(dir, 'missing'))).toEqual([]);
	});
});
