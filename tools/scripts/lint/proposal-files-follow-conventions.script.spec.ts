import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	expectedName,
	findConventionDrift,
} from './proposal-files-follow-conventions.script';

describe('proposal-files-follow-conventions lint', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	const proposal = (dir: string, files: string): string => {
		const rel = `docs/delendai/proposals/${dir}/x00001-thing.md`;
		write(
			rel,
			`---\nid: x00001\n---\n\n### S1 — thing\n- **Status**: pending\n- **Files**: ${files}\n- **Gate**: none\n`,
		);
		return rel;
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-files-conventions-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('accepts a declared path whose name has a role', () => {
		proposal('ready', '`packages/core/src/lib/git-observer.service.ts`');
		expect(findConventionDrift(root)).toEqual([]);
	});

	it('reports a path with no role with proposal, slice and the accepted name', () => {
		const rel = proposal(
			'ready',
			'`packages/core/src/lib/git-observer.ts`',
		);
		expect(findConventionDrift(root)).toEqual([
			{
				proposal: rel,
				slice: 'S1',
				path: 'packages/core/src/lib/git-observer.ts',
				expected: '`packages/core/src/lib/git-observer.service.ts`',
			},
		]);
	});

	it('judges in-progress proposals too', () => {
		proposal('in-progress', '`packages/core/src/lib/knowledge-cache.ts`');
		expect(findConventionDrift(root)).toHaveLength(1);
	});

	it('does not judge a file that already exists', () => {
		write('packages/core/src/lib/old-name.ts', 'export const x = 1;\n');
		proposal('ready', '`packages/core/src/lib/old-name.ts`');
		expect(findConventionDrift(root)).toEqual([]);
	});

	it('does not judge directories, globs or other kinds of file', () => {
		proposal(
			'ready',
			'`packages/core/src/lib/observers/`, `packages/core/src/lib/*.ts`, `docs/delendai/notes.md`, `packages/core/src/lib/thing.d.ts`, `scratch/thing.ts`',
		);
		expect(findConventionDrift(root)).toEqual([]);
	});

	it('does not judge done or review proposals', () => {
		proposal('done', '`packages/core/src/lib/git-observer.ts`');
		proposal('review', '`packages/core/src/lib/git-observer.ts`');
		expect(findConventionDrift(root)).toEqual([]);
	});

	it('says why an index barrel inside a feature folder is refused', () => {
		expect(
			expectedName('packages/core/src/lib/observers/index.ts'),
		).toContain('no barrel');
	});

	it('lists the role suffixes when none derives a name', () => {
		expect(expectedName('apps/web/odd/thing.ts')).toContain('.service');
	});
});
