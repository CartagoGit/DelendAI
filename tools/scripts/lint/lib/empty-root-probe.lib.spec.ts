import { describe, expect, it } from 'vitest';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { judgeEmptyRootRuns, runOverEmptyRoot } from './empty-root-probe.lib';

const LINT = 'tools/scripts/lint/a.script.ts';

describe('judgeEmptyRootRuns', () => {
	it('fails a lint that passes over the empty tree unless it is allowed', () => {
		expect(
			judgeEmptyRootRuns([{ file: LINT, exitCode: 0 }], {}),
		).toHaveLength(1);
		expect(
			judgeEmptyRootRuns([{ file: LINT, exitCode: 0 }], {
				[LINT]: 'why',
			}),
		).toEqual([]);
	});

	it('fails a run that did not exit, allowed or not, and names the cause', () => {
		for (const allowed of [{}, { [LINT]: 'why' }]) {
			const findings = judgeEmptyRootRuns(
				[{ file: LINT, exitCode: null }],
				allowed,
			);
			expect(findings).toHaveLength(1);
			expect(findings[0]?.detail).toContain('did not exit');
		}
	});

	it('accepts a lint that fails over the empty tree', () => {
		expect(judgeEmptyRootRuns([{ file: LINT, exitCode: 1 }], {})).toEqual(
			[],
		);
	});

	it('accepts an allowed lint that refuses, and fails an entry nothing runs', () => {
		// Refusing over the empty tree is never wrong; whether an allowed
		// lint does depends on the environment.
		expect(
			judgeEmptyRootRuns([{ file: LINT, exitCode: 1 }], {
				[LINT]: 'why',
			}),
		).toEqual([]);
		expect(judgeEmptyRootRuns([], { [LINT]: 'why' })).toHaveLength(1);
	});
});

describe('runOverEmptyRoot', () => {
	it('runs each lint from a tree holding only tools/ and reports its exit code', () => {
		const repo = mkdtempSync(join(tmpdir(), 'delendai-x01027-probe-'));
		try {
			mkdirSync(join(repo, 'tools'));
			writeFileSync(join(repo, 'tools', 'ok.ts'), 'process.exit(0);\n');
			writeFileSync(
				join(repo, 'tools', 'refuses.ts'),
				'process.exit(3);\n',
			);
			// Proves the probe tree is not the real one: only tools/ is there.
			writeFileSync(
				join(repo, 'tools', 'sees.ts'),
				"import { existsSync } from 'node:fs';\nprocess.exit(existsSync('packages') ? 1 : 0);\n",
			);
			const runs = runOverEmptyRoot(repo, [
				'tools/ok.ts',
				'tools/refuses.ts',
				'tools/sees.ts',
			]);
			expect(runs.map((run) => run.exitCode)).toEqual([0, 3, 0]);
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});
});
