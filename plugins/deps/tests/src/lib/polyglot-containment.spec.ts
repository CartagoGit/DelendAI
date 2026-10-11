/**
 * polyglot-containment.spec.ts — the polyglot manifest reader stays
 * inside the workspace root.
 *
 * `listPolyglotDeps` walks a fixed list of manifest names relative to
 * the root it is given. Resolving them lexically is a string comparison,
 * so a root whose manifest is a symlink out of the workspace would have
 * reported another project's Python, Rust or Go dependencies as this
 * one's. Physical containment resolves the real path first.
 */
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listPolyglotDeps } from '@delendai/deps/lib/services/polyglot';

const PYPROJECT = [
	'[project]',
	'name = "demo"',
	'dependencies = ["requests>=2.0"]',
	'',
].join('\n');
const OUTSIDE_PYPROJECT = [
	'[project]',
	'name = "secret"',
	'dependencies = ["stolen>=1.0"]',
	'',
].join('\n');

describe('listPolyglotDeps workspace containment', () => {
	let parent = '';
	let workspace = '';
	let outside = '';

	beforeEach(() => {
		parent = mkdtempSync(join(tmpdir(), 'polyglot-containment-'));
		workspace = join(parent, 'workspace');
		outside = join(parent, 'outside');
		mkdirSync(workspace, { recursive: true });
		mkdirSync(outside, { recursive: true });
		writeFileSync(
			join(outside, 'pyproject.toml'),
			OUTSIDE_PYPROJECT,
			'utf8',
		);
	});

	afterEach(() => {
		rmSync(parent, { recursive: true, force: true });
	});

	it('reads a manifest that really is inside the root', async () => {
		writeFileSync(join(workspace, 'pyproject.toml'), PYPROJECT, 'utf8');

		const manifests = await listPolyglotDeps(workspace);

		expect(manifests.some((m) => m.ecosystem === 'python')).toBe(true);
	});

	it('reads nothing through a manifest symlinked out of the root', async () => {
		// The manifest name is fixed, so the symlink is the file itself:
		// `workspace/pyproject.toml` -> `outside/pyproject.toml`.
		symlinkSync(
			join(outside, 'pyproject.toml'),
			join(workspace, 'pyproject.toml'),
		);

		const manifests = await listPolyglotDeps(workspace);

		// The outside project's dependency must never be reported.
		expect(JSON.stringify(manifests)).not.toContain('stolen');
	});
});
