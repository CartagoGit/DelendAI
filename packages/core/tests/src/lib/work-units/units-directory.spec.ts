/**
 * units-directory.spec.ts — the folder of units follows the cache root
 * the project declares.
 *
 * The units are a full checkout of the repository each: they appear and
 * disappear inside the tree every time an agent starts or ends a unit.
 * A constant pinned to `.cache/delendai/.worktrees` ignored the
 * project's own `cacheDir`, so a project that kept its cache out of the
 * tree still had its worktrees inside it — and every language server
 * watching the tree was told about each one.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_CORE_PATHS } from '@delendai/core/lib/contracts/interfaces/core-paths.interface';
import {
	DEFAULT_UNITS_DIRECTORY,
	unitsDirectoryFor,
} from '@delendai/core/lib/work-units/units-directory.constant';
import { resolveUnitsDirectory } from '@delendai/core/lib/work-units/units-directory.service';

const roots: string[] = [];

/** A workspace root with (or without) a configuration file. */
const workspaceWith = (config: string | undefined): string => {
	const root = mkdtempSync(join(tmpdir(), 'units-directory-'));
	roots.push(root);
	if (config !== undefined) {
		writeFileSync(join(root, 'delendai.config.json'), config, 'utf8');
	}
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('unitsDirectoryFor', () => {
	it('puts the units under the cache root the project declares', () => {
		expect(unitsDirectoryFor('.cache/delendai')).toBe(
			'.cache/delendai/.worktrees',
		);
		expect(unitsDirectoryFor('.cache/other')).toBe(
			'.cache/other/.worktrees',
		);
		expect(unitsDirectoryFor('/tmp/cache')).toBe('/tmp/cache/.worktrees');
	});

	it('keeps the default where it always was', () => {
		expect(DEFAULT_UNITS_DIRECTORY).toBe('.cache/delendai/.worktrees');
		expect(DEFAULT_UNITS_DIRECTORY).toBe(
			unitsDirectoryFor(DEFAULT_CORE_PATHS.cacheDir),
		);
	});
});

describe('resolveUnitsDirectory', () => {
	it('reads the cache root the project declares', async () => {
		const root = workspaceWith('{ "cacheDir": ".cache/other" }');
		expect(await resolveUnitsDirectory(root)).toBe(
			'.cache/other/.worktrees',
		);
	});

	it('falls back to the default when the project declares none', async () => {
		expect(await resolveUnitsDirectory(workspaceWith(undefined))).toBe(
			DEFAULT_UNITS_DIRECTORY,
		);
		expect(await resolveUnitsDirectory(workspaceWith('{ }'))).toBe(
			DEFAULT_UNITS_DIRECTORY,
		);
	});

	it('places the units outside the checkout when the cache root is absolute', async () => {
		const root = workspaceWith('{ "cacheDir": "/tmp/delendai-cache" }');
		expect(await resolveUnitsDirectory(root)).toBe(
			'/tmp/delendai-cache/.worktrees',
		);
	});
});
