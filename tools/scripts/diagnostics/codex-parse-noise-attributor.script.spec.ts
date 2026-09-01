import { describe, expect, it } from 'vitest';

import {
	attributeLog,
	parseFlags,
} from './codex-parse-noise-attributor.script.ts';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const withTemp = async (fn: (dir: string) => Promise<void>): Promise<void> => {
	const dir = await mkdtemp(join(tmpdir(), 'codex-attrib-'));
	try {
		await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
};

const sampleLog = `2026-08-31 09:00:00.000 [info] [CodexMcpConnection] Initialize received id=1
2026-08-31 09:00:00.500 [warning] [IpcRouter] socket opened
2026-08-31 09:00:01.123 [warning] Failed to parse message: "\\n"
2026-08-31 09:00:02.000 [info] [CodexMcpConnection] request id=2 method=tools/list
2026-08-31 09:00:02.500 [warning] Failed to parse message: "\\n"
2026-08-31 09:00:03.000 [error] [CodexMcpConnection] cli: message="timeout"
2026-08-31 09:00:04.000 [warning] Failed to parse message: "\\n"
`;

describe('codex-parse-noise-attributor', () => {
	it('parses flags', () => {
		expect(parseFlags([])).toEqual({
			rewrite: false,
			root: expect.stringContaining('.vscode-server'),
		});
		expect(parseFlags(['--rewrite'])).toMatchObject({ rewrite: true });
		expect(parseFlags(['--root=/tmp/x'])).toMatchObject({ root: '/tmp/x' });
	});

	it('attributes every noise line to the nearest preceding channel', async () => {
		await withTemp(async (dir) => {
			const logDir = join(dir, 'openai.chatgpt');
			await mkdir(logDir, { recursive: true });
			const logPath = join(logDir, 'Codex.log');
			await writeFile(logPath, sampleLog, 'utf8');
			const noise = await attributeLog(logPath);
			expect(noise.length).toBe(3);
			// Fixture has CodexMcpConnection (line 1) followed by IpcRouter
			// (line 2). The 3 noise lines, walking backwards, hit IpcRouter,
			// IpcRouter, and CodexMcpConnection respectively.
			const channels = noise.map((n) => n.channel);
			expect(channels).toEqual([
				'IpcRouter',
				'CodexMcpConnection',
				'CodexMcpConnection',
			]);
			for (const n of noise) {
				expect(n.timestamp).toMatch(/^2026-08-31/);
			}
		});
	});

	it('falls back to <unknown> when no channel line precedes the noise', async () => {
		await withTemp(async (dir) => {
			const logDir = join(dir, 'openai.chatgpt');
			await mkdir(logDir, { recursive: true });
			const logPath = join(logDir, 'Codex.log');
			await writeFile(
				logPath,
				'2026-08-31 09:00:01.123 [warning] Failed to parse message: "\\n"\n',
				'utf8',
			);
			const noise = await attributeLog(logPath);
			expect(noise.length).toBe(1);
			expect(noise[0]?.channel).toBe('<unknown>');
			expect(noise[0]?.precedingLine).toBe('');
		});
	});
});
