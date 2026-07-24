import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanMissingFiles } from './proposal-files-exist.script';

describe('proposal-files-exist lint', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-files-exist-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('flags a Files: path that does not exist on disk', () => {
		write(
			'docs/mcp-vertex/proposals/done/feats/f00001-thing.md',
			'---\nid: f00001\nstatus: done\n---\n\n' +
				'### S1 — thing\n' +
				'- **Status**: done\n' +
				'- **Files**: `packages/core/src/lib/ghost.ts`\n' +
				'- **Gate**: e2e\n',
		);
		const result = scanMissingFiles(root);
		expect(
			result['docs/mcp-vertex/proposals/done/feats/f00001-thing.md'],
		).toEqual(['packages/core/src/lib/ghost.ts']);
	});

	it('passes when every Files: path exists, including multi-line lists', () => {
		write('packages/core/src/lib/real.ts', 'export const x = 1;\n');
		write('packages/core/src/lib/real2.ts', 'export const y = 2;\n');
		write(
			'docs/mcp-vertex/proposals/done/feats/f00002-thing.md',
			'---\nid: f00002\nstatus: done\n---\n\n' +
				'### S1 — thing\n' +
				'- **Status**: done\n' +
				'- **Files**: `packages/core/src/lib/real.ts`,\n' +
				'  `packages/core/src/lib/real2.ts`\n' +
				'- **Gate**: e2e\n',
		);
		expect(scanMissingFiles(root)).toEqual({});
	});

	it('ignores ready/ and paused/ proposals (planned, not yet built)', () => {
		write(
			'docs/mcp-vertex/proposals/ready/f00003-thing.md',
			'- **Files**: `packages/core/src/lib/not-yet.ts`\n',
		);
		write(
			'docs/mcp-vertex/proposals/paused/f00004-thing.md',
			'- **Files**: `packages/core/src/lib/not-yet-either.ts`\n',
		);
		expect(scanMissingFiles(root)).toEqual({});
	});

	it('ignores glob patterns, JSX-like tags, and none/n-a placeholders', () => {
		write(
			'docs/mcp-vertex/proposals/done/feats/f00005-thing.md',
			'- **Files**: `plugins/*/src/index.ts`, `<PageHeader>`, none\n',
		);
		expect(scanMissingFiles(root)).toEqual({});
	});

	it('does not flag a proposal self-referencing its own pre-transition ready/ path', () => {
		write(
			'docs/mcp-vertex/proposals/done/plans/q00099-thing.md',
			'- **Files**: `docs/mcp-vertex/proposals/ready/q00099-thing.md`\n',
		);
		expect(scanMissingFiles(root)).toEqual({});
	});

	it('strips trailing line-number references before checking existence', () => {
		write('packages/core/src/lib/real.ts', 'export const x = 1;\n');
		write(
			'docs/mcp-vertex/proposals/done/audits/a00099-thing.md',
			'- **Files**: `packages/core/src/lib/real.ts:12,45-60`\n',
		);
		expect(scanMissingFiles(root)).toEqual({});
	});
});
