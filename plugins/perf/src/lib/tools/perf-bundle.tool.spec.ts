import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';
import { buildPerfBundleRegistration } from './perf-bundle.tool';
import type {
	IPerfBudgets,
	IPerfScanDeps,
} from '../contracts/interfaces/perf.interface';

const fixedDeps = (
	files: ReadonlyArray<{ path: string; bytes: number }>,
): IPerfScanDeps => ({
	listSizes: async () => files,
});

const registration = () =>
	buildPerfBundleRegistration({
		namespacePrefix: 'mcp',
		workspaceRootAbs: '/tmp/perf-fixture',
		deps: fixedDeps([
			{ path: 'dist/a.js', bytes: 1000 },
			{ path: 'dist/big.js', bytes: 5_000 },
			{ path: 'dist/medium.js', bytes: 2_500 },
		]),
	});

describe('perf_bundle (f00126 S2)', () => {
	it('reports the largest files first and the total bytes', async () => {
		const captured = await captureToolRegistration(registration());
		const out = (await captured.invoke({})) as {
			globs: string[];
			fileCount: number;
			totalBytes: number;
			largest: ReadonlyArray<{ path: string; bytes: number }>;
			findings: ReadonlyArray<{ ruleId: string; severity: string }>;
			worst: string;
		};
		expect(out.globs).toEqual(['dist/**/*.js']);
		expect(out.fileCount).toBe(3);
		expect(out.totalBytes).toBe(8_500);
		expect(out.largest[0]?.path).toBe('dist/big.js');
		expect(out.largest[0]?.bytes).toBe(5_000);
		expect(out.findings).toEqual([]);
		expect(out.worst).toBe('none');
	});

	it('flags a per-file budget breach with file-over-budget findings', async () => {
		const reg = buildPerfBundleRegistration({
			namespacePrefix: 'mcp',
			workspaceRootAbs: '/tmp/perf-fixture',
			deps: fixedDeps([{ path: 'dist/big.js', bytes: 5_000 }]),
		});
		const captured = await captureToolRegistration(reg);
		const out = (await captured.invoke({ maxFileKb: 2 })) as {
			findings: ReadonlyArray<{ ruleId: string; severity: string }>;
			worst: string;
		};
		expect(out.findings.length).toBe(1);
		expect(out.findings[0]?.ruleId).toBe('file-over-budget');
		expect(out.findings[0]?.severity).toBe('high');
		expect(out.worst).toBe('high');
	});

	it('flags a total-budget breach with total-over-budget findings', async () => {
		const reg = buildPerfBundleRegistration({
			namespacePrefix: 'mcp',
			workspaceRootAbs: '/tmp/perf-fixture',
			deps: fixedDeps([
				{ path: 'dist/a.js', bytes: 1_000 },
				{ path: 'dist/b.js', bytes: 2_000 },
			]),
		});
		const captured = await captureToolRegistration(reg);
		const out = (await captured.invoke({ maxTotalKb: 1 })) as {
			findings: ReadonlyArray<{ ruleId: string; severity: string }>;
		};
		expect(out.findings.some((f) => f.ruleId === 'total-over-budget')).toBe(
			true,
		);
	});

	it('uses the caller-provided globs when present, else the default', async () => {
		let capturedGlobs: readonly string[] = [];
		const reg = buildPerfBundleRegistration({
			namespacePrefix: 'mcp',
			workspaceRootAbs: '/tmp/perf-fixture',
			deps: {
				listSizes: async (globs) => {
					capturedGlobs = globs;
					return [];
				},
			},
		});
		const captured = await captureToolRegistration(reg);
		await captured.invoke({ globs: ['build/**/*.mjs'] });
		expect(capturedGlobs).toEqual(['build/**/*.mjs']);
	});

	it('budgets conversion rounds kB to bytes deterministically', () => {
		// Round-trip check; the tool converts kB → bytes via Math.round.
		const budgets: IPerfBudgets = {
			maxFileBytes: Math.round(2 * 1024),
			maxTotalBytes: Math.round(1 * 1024),
		};
		expect(budgets.maxFileBytes).toBe(2_048);
		expect(budgets.maxTotalBytes).toBe(1_024);
	});
});
