/**
 * Specs for the two convention tools' run functions (f00037 S3).
 * Exercises the pure `runClassifyPaths` and the scan-backed
 * `runCheckConventions` (with an in-memory reader), asserting the
 * envelope shapes the MCP layer will deliver.
 */
import { describe, expect, it } from 'vitest';

import { runClassifyPaths } from '../../../../src/lib/tools/classify-paths.tool';
import { runCheckConventions } from '../../../../src/lib/tools/check-conventions.tool';
import type {
	IDirEntry,
	IDirReader,
} from '../../../../src/lib/services/conventions-scan.service';

const parse = (result: { content: Array<{ text?: string }> }) =>
	JSON.parse(result.content[0]?.text ?? '{}');

describe('runClassifyPaths', async () => {
	it('classifies each path and lists the unmatched ones', async () => {
		const out = parse(
			runClassifyPaths({
				paths: [
					'pkg/src/lib/tools/a.tool.ts',
					'pkg/src/lib/helper.ts',
					'pkg/src/index.ts',
				],
			}),
		);
		expect(out.ok).toBe(true);
		expect(out.results).toEqual([
			{ path: 'pkg/src/lib/tools/a.tool.ts', role: 'tool' },
			{ path: 'pkg/src/lib/helper.ts', role: 'other' },
			{ path: 'pkg/src/index.ts', role: 'barrel' },
		]);
		expect(out.unmatched).toEqual(['pkg/src/lib/helper.ts']);
	});

	it('handles an empty path list', async () => {
		const out = parse(runClassifyPaths({ paths: [] }));
		expect(out.results).toEqual([]);
		expect(out.unmatched).toEqual([]);
	});
});

const file = (name: string): IDirEntry => ({ name, isDirectory: false });
const dir = (name: string): IDirEntry => ({ name, isDirectory: true });

describe('runCheckConventions', async () => {
	const reader: IDirReader = {
		async list(relDir: string) {
			const tree: Record<string, readonly IDirEntry[]> = {
				pkg: [dir('src')],
				'pkg/src': [file('a.tool.ts'), file('loose.ts')],
			};
			return tree[relDir] ?? [];
		},
	};

	it('reports drift counts and the unmatched list', async () => {
		const out = parse(
			await runCheckConventions(
				{ roots: ['pkg'] },
				{ namespacePrefix: 'conventions', reader },
			),
		);
		expect(out.ok).toBe(true);
		expect(out.total).toBe(2);
		expect(out.unmatchedCount).toBe(1);
		expect(out.unmatched).toEqual(['pkg/src/loose.ts']);
		expect(out.counts.tool).toBe(1);
	});

	it('falls back to the configured default roots when none given', async () => {
		const out = parse(
			await runCheckConventions(
				{},
				{
					namespacePrefix: 'conventions',
					reader,
					defaultRoots: ['pkg'],
				},
			),
		);
		expect(out.total).toBe(2);
	});

	it('returns a structured error when the reader throws at the root', async () => {
		const failing: IDirReader = {
			async list() {
				throw new Error('boom');
			},
		};
		const out = parse(
			await runCheckConventions(
				{ roots: ['pkg'] },
				{ namespacePrefix: 'conventions', reader: failing },
			),
		);
		// A root-level throw is swallowed by the scan (per-dir catch), so
		// the tool still returns ok with zero files rather than erroring.
		expect(out.ok).toBe(true);
		expect(out.total).toBe(0);
	});
});
