import { describe, expect, it } from 'vitest';

import { shingleBlocks } from '../../../../src/lib/scan/shingle';

const build = (lines: string[]): string => lines.join('\n');

describe('scan/shingle — shingleBlocks', () => {
	it('returns no hits when no block is duplicated across files', () => {
		const files = new Map<string, string>([
			[
				'a.ts',
				build([
					'export const a = 1;',
					'',
					'export const helper = () => null;',
					'',
					'// end',
				]),
			],
			[
				'b.ts',
				build([
					'export const b = 2;',
					'',
					'export const helper = () => 42;',
					'',
					'// end',
				]),
			],
		]);
		const hits = shingleBlocks(files, { blockLines: 3, minBlockChars: 20 });
		expect(hits).toHaveLength(0);
	});

	it('detects an 8-line block duplicated across two files', () => {
		const duplicated = [
			'export const helper = (x: number): number => {',
			'  if (x < 0) return 0;',
			'  if (x > 100) return 100;',
			'  return x * 2;',
			'};',
			'',
			'// padding line 1',
			'// padding line 2',
		].join('\n');
		const files = new Map<string, string>([
			['plugins/foo/src/lib/h.ts', duplicated],
			['plugins/bar/src/lib/h.ts', duplicated],
		]);
		const hits = shingleBlocks(files);
		expect(hits.length).toBeGreaterThanOrEqual(2);
		const relPaths = new Set(hits.map((h) => h.relPath));
		expect(relPaths.size).toBe(2);
	});

	it('reports a copies count equal to the number of distinct files', () => {
		const duplicated = 'x\n'.repeat(20).trim();
		const files = new Map<string, string>([
			['a.ts', duplicated],
			['b.ts', duplicated],
			['c.ts', duplicated],
		]);
		const hits = shingleBlocks(files, { blockLines: 4, minBlockChars: 0 });
		const maxCopies = Math.max(...hits.map((h) => h.copies));
		expect(maxCopies).toBe(3);
	});

	it('skips blocks that are mostly imports', () => {
		const imports = Array.from(
			{ length: 12 },
			(_, i) => `import { x${i} } from './x${i}';`,
		).join('\n');
		const files = new Map<string, string>([
			['a.ts', imports],
			['b.ts', imports],
		]);
		const hits = shingleBlocks(files, { blockLines: 8, minBlockChars: 0 });
		// The shingle skips blocks that are 8+ consecutive import lines.
		// The fixture has 12 import lines so any window of 8 will be
		// all-imports and therefore skipped.
		expect(hits).toHaveLength(0);
	});

	it('skips duplicated multiline import clauses', () => {
		const imports = [
			"import { basename, dirname, join } from 'node:path';",
			'',
			"import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
			'',
			'import {',
			'  SafeWorkspaceReader,',
			'  withFileMutex,',
			"} from '@mcp-vertex/core/public';",
		].join('\n');
		const files = new Map<string, string>([
			['plugins/foo/src/lib/a.ts', imports],
			['plugins/bar/src/lib/b.ts', imports],
		]);
		expect(shingleBlocks(files)).toHaveLength(0);
	});
});
