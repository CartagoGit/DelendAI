import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	writeFileSync,
	readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	countEffectBoundaryViolations,
	groupByPlugin,
	isAuthorizedAdapter,
	scanViolations,
} from './effect-boundaries.script';

describe('effect-boundaries lint', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'effect-boundaries-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('flags a direct import of a sensitive Node builtin in plugin source', () => {
		write(
			'plugins/foo/src/lib/shell.service.ts',
			"import { spawn } from 'node:child_process';\n" +
				'export const run = () => spawn("ls");\n',
		);
		const result = scanViolations(root);
		expect(result['plugins/foo/src/lib/shell.service.ts']).toBe(1);
	});

	it('flags both node:-prefixed and bare spellings, and dynamic require()', () => {
		write(
			'plugins/foo/src/lib/multi.ts',
			"import { readFileSync } from 'fs';\n" +
				"import { readFile } from 'node:fs/promises';\n" +
				"const mod = require('node:net');\n",
		);
		expect(
			countEffectBoundaryViolations(
				readFileSync(
					join(root, 'plugins/foo/src/lib/multi.ts'),
					'utf8',
				),
			),
		).toBe(3);
	});

	it('exempts a file carrying the effect-boundary-authorized marker with a real reason', () => {
		const body =
			'// effect-boundary-authorized: audited fs port, see PR #42 review notes\n' +
			"import { readFile } from 'node:fs/promises';\n" +
			'export const readIt = readFile;\n';
		write('plugins/foo/src/lib/fs-port.ts', body);
		expect(isAuthorizedAdapter(body)).toBe(true);
		const result = scanViolations(root);
		expect(result['plugins/foo/src/lib/fs-port.ts']).toBeUndefined();
	});

	it('does NOT authorize a marker whose reason is too short (< 12 chars)', () => {
		const body =
			'// effect-boundary-authorized: todo\n' +
			"import { readFile } from 'node:fs/promises';\n";
		write('plugins/foo/src/lib/short-reason.ts', body);
		expect(isAuthorizedAdapter(body)).toBe(false);
		const result = scanViolations(root);
		expect(result['plugins/foo/src/lib/short-reason.ts']).toBe(1);
	});

	it('ignores non-plugin files (outside plugins/**/src/**)', () => {
		write(
			'packages/core/src/lib/shell.ts',
			"import { spawn } from 'node:child_process';\n",
		);
		write(
			'tools/scripts/some-script.ts',
			"import { readFileSync } from 'node:fs';\n",
		);
		expect(scanViolations(root)).toEqual({});
	});

	it('ignores spec/test files and test-harness "tests/" trees', () => {
		write(
			'plugins/foo/src/lib/shell.spec.ts',
			"import { spawn } from 'node:child_process';\n",
		);
		write(
			'plugins/foo/tests/src/lib/harness.ts',
			"import { spawn } from 'node:child_process';\n",
		);
		expect(scanViolations(root)).toEqual({});
	});

	it('groupByPlugin aggregates per-file violations by plugin name', () => {
		write(
			'plugins/foo/src/lib/a.ts',
			"import { spawn } from 'node:child_process';\n",
		);
		write(
			'plugins/foo/src/lib/b.ts',
			"import { readFile } from 'node:fs/promises';\n",
		);
		write(
			'plugins/bar/src/lib/c.ts',
			"import { readFile } from 'node:fs/promises';\n",
		);
		const current = scanViolations(root);
		expect(groupByPlugin(current)).toEqual({ foo: 2, bar: 1 });
	});
});

describe('effect-boundaries ratchet (count may only decrease)', () => {
	// These tests exercise the pure counting/grouping surface directly
	// (scanViolations + a hand-rolled baseline comparison) rather than
	// shelling out to `main()`, mirroring how `types-in-contracts` keeps
	// its CLI-vs-engine split testable without a subprocess.
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'effect-boundaries-ratchet-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const regressions = (
		current: Record<string, number>,
		baseline: Record<string, number>,
	): string[] =>
		Object.entries(current)
			.filter(([rel, count]) => count > (baseline[rel] ?? 0))
			.map(([rel]) => rel);

	it('a NEW violating file not in the baseline is a regression', () => {
		const baseline: Record<string, number> = {};
		write(
			'plugins/foo/src/lib/new.ts',
			"import { spawn } from 'node:child_process';\n",
		);
		const current = scanViolations(root);
		expect(regressions(current, baseline)).toEqual([
			'plugins/foo/src/lib/new.ts',
		]);
	});

	it('a count that matches or is below the baseline is NOT a regression', () => {
		write(
			'plugins/foo/src/lib/existing.ts',
			"import { spawn } from 'node:child_process';\n" +
				"import { readFile } from 'node:fs/promises';\n",
		);
		const baseline: Record<string, number> = {
			'plugins/foo/src/lib/existing.ts': 2,
		};
		const current = scanViolations(root);
		expect(regressions(current, baseline)).toEqual([]);
	});

	it('draining a violation (count decreases) is allowed and shrinks the total', () => {
		write(
			'plugins/foo/src/lib/drained.ts',
			"import { spawn } from 'node:child_process';\n",
		);
		const baseline: Record<string, number> = {
			'plugins/foo/src/lib/drained.ts': 2,
		};
		const current = scanViolations(root);
		expect(regressions(current, baseline)).toEqual([]);
		const totalCur = Object.values(current).reduce((a, b) => a + b, 0);
		const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);
		expect(totalCur).toBeLessThan(totalBase);
	});

	it('--update round-trip: writing scanViolations() as the baseline, then re-scanning the same tree, reports zero regressions', () => {
		// `main()`'s `--update` branch is `writeFileSync(baselinePath,
		// JSON.stringify(scanViolations(root), null, '\t'))` — no
		// transformation beyond serialization. This test exercises that
		// contract directly (repoRoot() is git-rooted and not
		// injectable, so the CLI shell itself is not subprocess-tested
		// here, matching `types-in-contracts.script.spec.ts`, which
		// tests only the pure `scanViolations` engine).
		write(
			'plugins/foo/src/lib/a.ts',
			"import { spawn } from 'node:child_process';\n",
		);
		write(
			'plugins/foo/src/lib/b.ts',
			"import { readFile } from 'node:fs/promises';\n" +
				"import { createServer } from 'node:http';\n",
		);
		const beforeUpdate = scanViolations(root);
		const writtenBaseline = JSON.parse(
			JSON.stringify(beforeUpdate, null, '\t'),
		) as Record<string, number>;

		// Nothing on disk changed between building the baseline and
		// re-scanning, so the ratchet must report zero regressions.
		const afterUpdate = scanViolations(root);
		expect(regressions(afterUpdate, writtenBaseline)).toEqual([]);
		expect(afterUpdate).toEqual(writtenBaseline);
	});

	it('a file whose count INCREASES beyond its baselined value is a regression even if it already existed', () => {
		write(
			'plugins/foo/src/lib/grown.ts',
			"import { spawn } from 'node:child_process';\n" +
				"import { readFile } from 'node:fs/promises';\n" +
				"import { createServer } from 'node:http';\n",
		);
		const baseline: Record<string, number> = {
			'plugins/foo/src/lib/grown.ts': 1,
		};
		const current = scanViolations(root);
		expect(regressions(current, baseline)).toEqual([
			'plugins/foo/src/lib/grown.ts',
		]);
	});
});
