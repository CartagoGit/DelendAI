import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
	enterRunTempRoot,
	runTempRootPath,
} from './run-temp-root.global-setup';

const here = dirname(fileURLToPath(import.meta.url));
const setupFile = resolve(here, 'run-temp-root.global-setup.ts');

describe('run temp root (x01091)', () => {
	it('names the root after the process and points the temp variables at it', () => {
		const base = mkdtempSync(join(tmpdir(), 'root-case-'));
		const env: NodeJS.ProcessEnv = { TMPDIR: '/before' };
		const run = enterRunTempRoot(env, runTempRootPath(4242, base));
		expect(run.root).toBe(join(base, 'delendai-test-run-4242'));
		expect([env.TMPDIR, env.TMP, env.TEMP]).toEqual([
			run.root,
			run.root,
			run.root,
		]);
		expect(existsSync(run.root)).toBe(true);
		run.leave();
		expect(existsSync(run.root)).toBe(false);
		expect(env).toEqual({ TMPDIR: '/before' });
	});

	describe('a child vitest run over a spec that leaks a directory', () => {
		let before: string[] = [];
		let after: string[] = [];
		let status: number | null = null;

		// The child run is the slow part; it is made once, outside any
		// test body, and the tests below only read what it left.
		beforeAll(() => {
			const work = mkdtempSync(join(tmpdir(), 'child-'));
			writeFileSync(
				join(work, 'leak.spec.ts'),
				"import { mkdtempSync } from 'node:fs';\nimport { tmpdir } from 'node:os';\nimport { join } from 'node:path';\ntest('leaks', () => {\n\tmkdtempSync(join(tmpdir(), 'leak-'));\n});\n",
			);
			writeFileSync(
				join(work, 'vitest.config.mjs'),
				`export default { test: { globals: true, include: ['leak.spec.ts'], globalSetup: [${JSON.stringify(setupFile)}] } };\n`,
			);
			const vitest = join(
				dirname(
					createRequire(import.meta.url).resolve(
						'vitest/package.json',
					),
				),
				'vitest.mjs',
			);
			before = readdirSync(tmpdir()).sort();
			status = spawnSync(
				process.execPath,
				[vitest, 'run', '--config', 'vitest.config.mjs'],
				{ cwd: work, encoding: 'utf8' },
			).status;
			after = readdirSync(tmpdir()).sort();
			expect(before).toContain(work.slice(tmpdir().length + 1));
		}, 60_000);

		it('runs the leaking spec to a pass', () => {
			expect(status).toBe(0);
		});

		it('leaves the system temp directory with the same entry names', () => {
			expect(after).toEqual(before);
		});
	});
});
