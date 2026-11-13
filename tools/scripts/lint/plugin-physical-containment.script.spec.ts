/**
 * plugin-physical-containment.script.spec.ts — the ratchet counts exactly
 * the resolutions a symlink can escape, and nothing that is already
 * physical.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	countLexicalContainment,
	scanLexicalContainment,
} from './plugin-physical-containment.script';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('countLexicalContainment', () => {
	it('counts both names of the lexical resolver', () => {
		expect(
			countLexicalContainment(
				[
					'const a = resolveWorkspaceContained(root, input);',
					'const b = resolveWorkspaceContainedLexical(root, other);',
				].join('\n'),
			),
		).toBe(2);
	});

	it('does not count the physical resolver', () => {
		expect(
			countLexicalContainment(
				'const c = await resolveWorkspaceContainedEffective(root, input);',
			),
		).toBe(0);
	});

	it('does not count an import that is never called', () => {
		expect(
			countLexicalContainment(
				"import { resolveWorkspaceContained } from '@delendai/core/public';",
			),
		).toBe(0);
	});
});

describe('scanLexicalContainment', () => {
	it('scans plugin source only, never specs or other roots', () => {
		const root = mkdtempSync(join(tmpdir(), 'containment-lint-'));
		roots.push(root);
		mkdirSync(join(root, 'plugins/docs/src/lib'), { recursive: true });
		mkdirSync(join(root, 'plugins/docs/tests'), { recursive: true });
		mkdirSync(join(root, 'packages/core/src'), { recursive: true });
		writeFileSync(
			join(root, 'plugins/docs/src/lib/engine.ts'),
			'resolveWorkspaceContained(a, b); resolveWorkspaceContained(c, d);',
		);
		writeFileSync(
			join(root, 'plugins/docs/src/lib/engine.spec.ts'),
			'resolveWorkspaceContained(a, b);',
		);
		writeFileSync(
			join(root, 'plugins/docs/tests/engine.spec.ts'),
			'resolveWorkspaceContained(a, b);',
		);
		writeFileSync(
			join(root, 'packages/core/src/contain-path.ts'),
			'resolveWorkspaceContained(a, b);',
		);

		expect(scanLexicalContainment(root)).toEqual({
			'plugins/docs/src/lib/engine.ts': 2,
		});
	});
});
