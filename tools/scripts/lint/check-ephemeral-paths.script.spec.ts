#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findEphemeralPathViolations } from './check-ephemeral-paths.script.ts';

const writeFixture = (root: string, relPath: string, content: string): void => {
	const abs = join(root, relPath);
	mkdirSync(join(abs, '..'), { recursive: true });
	writeFileSync(abs, content, 'utf8');
};

describe('findEphemeralPathViolations (f00058 S2)', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'check-ephemeral-paths-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns [] for a clean runtime tree', async () => {
		writeFixture(
			root,
			'packages/core/src/lib/clean.ts',
			"export const clean = (): string => 'ok';\n",
		);
		expect(await findEphemeralPathViolations(root)).toEqual([]);
	});

	it('flags mkdtempSync(join(tmpdir(), ...)) in runtime code with file and line', async () => {
		writeFixture(
			root,
			'packages/core/src/lib/probe.ts',
			[
				"import { mkdtempSync } from 'node:fs';",
				"import { tmpdir } from 'node:os';",
				"import { join } from 'node:path';",
				"export const probe = (): string => mkdtempSync(join(tmpdir(), 'x-'));",
			].join('\n'),
		);
		expect(await findEphemeralPathViolations(root)).toContainEqual({
			file: 'packages/core/src/lib/probe.ts',
			line: 4,
			token: 'mkdtempSync(join(tmpdir(',
			kind: 'mkdtemp-tmpdir',
		});
	});

	it('ignores the same mkdtemp pattern inside tools/scripts', async () => {
		writeFixture(
			root,
			'tools/scripts/example.ts',
			[
				"import { mkdtempSync } from 'node:fs';",
				"import { tmpdir } from 'node:os';",
				"import { join } from 'node:path';",
				"export const probe = (): string => mkdtempSync(join(tmpdir(), 'x-'));",
			].join('\n'),
		);
		expect(await findEphemeralPathViolations(root)).toEqual([]);
	});

	it('ignores the same mkdtemp pattern inside *.spec.ts', async () => {
		writeFixture(
			root,
			'packages/core/src/lib/probe.spec.ts',
			[
				"import { mkdtempSync } from 'node:fs';",
				"import { tmpdir } from 'node:os';",
				"import { join } from 'node:path';",
				"export const probe = (): string => mkdtempSync(join(tmpdir(), 'x-'));",
			].join('\n'),
		);
		expect(await findEphemeralPathViolations(root)).toEqual([]);
	});
});
