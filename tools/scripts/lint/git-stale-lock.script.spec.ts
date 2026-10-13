import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { livePidHoldsLock, parseFlags } from './git-stale-lock.script.ts';
import {
	closeSync,
	openSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const makeFreshLock = (dir: string): string => {
	const lockPath = join(dir, 'index.lock');
	const fd = openSync(lockPath, 'w');
	writeFileSync(fd, '');
	closeSync(fd);
	return lockPath;
};

const ageLock = (lockPath: string, ms: number): void => {
	const _st = statSync(lockPath);
	const past = new Date(Date.now() - ms);
	utimesSync(lockPath, past, past);
};

describe('git-stale-lock lint', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'git-stale-lock-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('parses flags', () => {
		expect(parseFlags([])).toEqual({ reclaim: false, graceMs: 30_000 });
		expect(parseFlags(['--reclaim'])).toEqual({
			reclaim: true,
			graceMs: 30_000,
		});
		expect(parseFlags(['--grace-ms=1000'])).toEqual({
			reclaim: false,
			graceMs: 1000,
		});
	});

	it('returns the test runner pid when holding a real file', () => {
		const lockPath = makeFreshLock(dir);
		const fd = openSync(lockPath, 'r+');
		try {
			const pids = livePidHoldsLock(lockPath);
			expect(pids.length).toBeGreaterThan(0);
			expect(pids).toContain(process.pid);
		} finally {
			closeSync(fd);
		}
	});

	it('returns no pids when no process holds the file', () => {
		const lockPath = makeFreshLock(dir);
		ageLock(lockPath, 5_000);
		const pids = livePidHoldsLock(lockPath);
		expect(pids).toEqual([]);
	});
});
