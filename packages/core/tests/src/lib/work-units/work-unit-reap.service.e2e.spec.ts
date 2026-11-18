/**
 * work-unit-reap.service.e2e.spec.ts — `work reap` reports the stray
 * files of the units' folder and the old test temp directories beside
 * every other leftover, over a throwaway clone and an injected temp root.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

import { cleanUnitRepos, unitRepo } from './unit-repo.helper';

const dirs: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	cleanUnitRepos();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe('work reap', () => {
	it('[<3000ms] reports old empty test temp directories without removing them, and has a list of stray files', async () => {
		const repo = unitRepo();
		const temp = mkdtempSync(join(tmpdir(), 'reap-wiring-'));
		dirs.push(temp);
		const old = join(temp, 'delendai-gh-old');
		mkdirSync(old);
		const weekAgo = Date.now() / 1000 - 7 * 24 * 60 * 60;
		utimesSync(old, weekAgo, weekAgo);
		vi.stubEnv('TMPDIR', temp);
		const result = await runWorkUnit(['reap'], {
			cwd: repo.root,
			globals: { workspace: repo.root, json: true, format: 'json' },
		});
		const data = result.data as {
			strayFiles: unknown[];
			testTemp: { empty: number; removed: number };
		};
		expect(data.strayFiles).toEqual([]);
		expect(data.testTemp).toMatchObject({ empty: 1, removed: 0 });
	});
});
