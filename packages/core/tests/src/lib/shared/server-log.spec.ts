/**
 * server-log.spec.ts — a server keeps its own log in the workspace, and
 * only the last days of it.
 */
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	expiredServerLogs,
	serverLogName,
	startServerLog,
} from '@delendai/core/lib/shared/server-log';

const roots: string[] = [];
const original = process.stderr.write;
afterEach(() => {
	process.stderr.write = original;
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe('expiredServerLogs', () => {
	it('keeps the newest days and names the rest, ignoring other files', () => {
		const names = [
			'mcp-server.2026-10-01.log',
			'mcp-server.2026-10-03.log',
			'mcp-server.2026-10-02.log',
			'notes.txt',
		];
		expect(expiredServerLogs(names, 2)).toEqual([
			'mcp-server.2026-10-01.log',
		]);
	});
});

describe('startServerLog', () => {
	it("copies stderr lines into the day's file, stamped, and drops old days", async () => {
		const cache = mkdtempSync(join(tmpdir(), 'server-log-'));
		roots.push(cache);
		const dir = join(cache, 'logs', 'mcp-server');
		mkdirSync(dir, { recursive: true });
		for (let day = 1; day <= 11; day += 1) {
			writeFileSync(
				join(
					dir,
					`mcp-server.2026-09-${String(day).padStart(2, '0')}.log`,
				),
				'old\n',
			);
		}
		const at = new Date('2026-10-07T10:00:00.000Z');
		process.stderr.write = (() => true) as typeof process.stderr.write;

		await startServerLog({
			cacheDirAbs: cache,
			label: 'test',
			now: () => at,
		});
		process.stderr.write('[delendai] booted\nhalf a ');
		process.stderr.write('line\n');
		await new Promise((done) => setTimeout(done, 50));

		const files = readdirSync(dir).sort();
		expect(files).toHaveLength(10);
		expect(files.at(-1)).toBe(serverLogName(at));
		const text = readFileSync(join(dir, serverLogName(at)), 'utf8');
		expect(text).toContain(
			`2026-10-07T10:00:00.000Z test#${String(process.pid)} [delendai] booted`,
		);
		expect(text).toContain('half a line');
		expect(text).toContain('--- server started (test) ---');
	});
});
