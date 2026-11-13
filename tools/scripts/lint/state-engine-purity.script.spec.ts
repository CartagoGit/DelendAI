/**
 * state-engine-purity.script.spec.ts — c00514 acceptance.
 *
 * Pins the strict purity contract: any file under
 * `packages/state/src/**` that imports a persistent-I/O API is
 * flagged. The fixture tree is hermetic; the test uses a tempdir.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanPurityViolations } from './state-engine-purity.script';

describe('state-engine-purity lint (c00514, strict contract)', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'state-engine-purity-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('accepts a pure producer (only `node:path`)', async () => {
		write(
			'packages/state/src/lib/pure.ts',
			"import { join } from 'node:path';\n" +
				'export const path = (a: string, b: string) => join(a, b);\n',
		);
		expect(await scanPurityViolations(root)).toEqual([]);
	});

	it('flags a bare `fs` import', async () => {
		write(
			'packages/state/src/lib/dirty.ts',
			"import { readFileSync } from 'fs';\n",
		);
		const v = await scanPurityViolations(root);
		expect(v).toHaveLength(1);
		expect(v[0]?.relPath).toBe('packages/state/src/lib/dirty.ts');
		expect(v[0]?.specifier).toBe('import "fs"');
	});

	it('flags a `node:fs` import', async () => {
		write(
			'packages/state/src/lib/dirty2.ts',
			"import { readFile } from 'node:fs/promises';\n",
		);
		const v = await scanPurityViolations(root);
		expect(v).toHaveLength(1);
		expect(v[0]?.specifier).toBe('import "fs/promises"');
	});

	it('flags a `Bun.write(...)` callee (no import needed)', async () => {
		write(
			'packages/state/src/lib/dirty3.ts',
			'export const persist = (path: string, body: string) =>\n' +
				'\tBun.write(path, body);\n',
		);
		const v = await scanPurityViolations(root);
		expect(v).toHaveLength(1);
		expect(v[0]?.specifier).toContain('Bun.write');
	});

	it('flags a `better-sqlite3` import', async () => {
		write(
			'packages/state/src/lib/dirty4.ts',
			"import Database from 'better-sqlite3';\n",
		);
		const v = await scanPurityViolations(root);
		expect(v).toHaveLength(1);
		expect(v[0]?.specifier).toBe('import "better-sqlite3"');
	});

	it('flags a `require("fs")` (CJS dynamic import)', async () => {
		write(
			'packages/state/src/lib/dirty5.ts',
			"const fs = require('node:fs');\n",
		);
		const v = await scanPurityViolations(root);
		expect(v).toHaveLength(1);
		expect(v[0]?.specifier).toBe('import "fs"');
	});

	it('exempts spec files (fixtures need I/O)', async () => {
		write(
			'packages/state/src/lib/pure.spec.ts',
			"import { readFileSync } from 'fs';\n",
		);
		expect(await scanPurityViolations(root)).toEqual([]);
	});

	it('exempts generated files', async () => {
		write(
			'packages/state/src/lib/foo.generated.ts',
			"import { writeFileSync } from 'fs';\n",
		);
		expect(await scanPurityViolations(root)).toEqual([]);
	});

	it('does NOT scan files outside packages/state/src/**', async () => {
		// A plugin file that imports fs MUST NOT be flagged — the
		// Phase-0 contract covers packages/state/src/** only (q00019
		// S5 extends the rule).
		write(
			'plugins/proposals/src/lib/something.ts',
			"import fs from 'fs';\n",
		);
		expect(await scanPurityViolations(root)).toEqual([]);
	});

	it('the actual packages/state/src/** tree passes (live repo)', async () => {
		// Run against the live repo root. If this fails, a producer
		// somewhere imported a persistent I/O API and the strict
		// contract regressed.
		const v = await scanPurityViolations();
		if (v.length > 0) {
			throw new Error(
				`live packages/state/src/** is not pure:\n${v
					.map((x) => `  ${x.relPath}:${x.line}  ${x.specifier}`)
					.join('\n')}`,
			);
		}
		expect(v).toEqual([]);
	});
});
