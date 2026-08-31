import { describe, expect, it } from 'vitest';

import {
	classifySolidFindings,
	formatReport,
	type ISolidScanResult,
} from './solid-compliance.script';

/** Helper to build a fileContents map from a record. */
const mkMap = (files: Record<string, string>): Map<string, string> => {
	return new Map(Object.entries(files));
};

describe('solid-compliance.script — pure engine', () => {
	it('clean fixture: zero findings', async () => {
		const files = mkMap({
			'plugins/example/src/lib/foo.ts': [
				'export const foo = async (): Promise<void> => {',
				'  const MAGIC = 100;',
				'  if (MAGIC > 0) {',
				'    return;',
				'  }',
				'};',
				'',
			].join('\n'),
		});
		const result = await classifySolidFindings(process.cwd(), files);
		expect(result.findings).toHaveLength(0);
		expect(result.scannedFiles).toBe(1);
	});

	it('long-switch-chain: ≥ 5 case branches flagged once', async () => {
		const body = [
			'export const route = (id: string): string => {',
			'  switch (id) {',
			"    case 'a': return 'A';",
			"    case 'b': return 'B';",
			"    case 'c': return 'C';",
			"    case 'd': return 'D';",
			"    case 'e': return 'E';",
			"    case 'f': return 'F';",
			'  }',
			'};',
		].join('\n');
		const files = mkMap({ 'plugins/example/src/lib/route.ts': body });
		const result = await classifySolidFindings(process.cwd(), files);
		const chains = result.findings.filter(
			(f) => f.id === 'long-switch-chain',
		);
		expect(chains).toHaveLength(1);
		expect(chains[0]?.relPath).toBe('plugins/example/src/lib/route.ts');
		expect(chains[0]?.message).toMatch(/6 case branches/);
	});

	it('oversized-file: > 400 LOC flagged once', async () => {
		const lines = Array.from(
			{ length: 401 },
			(_, i) => `// line ${i + 1}`,
		).join('\n');
		const files = mkMap({ 'plugins/example/src/lib/big.ts': lines });
		const result = await classifySolidFindings(process.cwd(), files, {
			maxLoc: 400,
		});
		const oversize = result.findings.filter(
			(f) => f.id === 'oversized-file',
		);
		expect(oversize).toHaveLength(1);
		expect(oversize[0]?.message).toMatch(/401 LOC/);
	});

	it('magic-number-in-plugin: literal flagged in plugins/* but not in core', async () => {
		const pluginBody = [
			'export const wait = (ms: number): Promise<void> =>',
			'  new Promise((r) => setTimeout(r, 12345));',
			'};',
		].join('\n');
		const coreBody = [
			'export const wait = (ms: number): Promise<void> =>',
			'  new Promise((r) => setTimeout(r, 12345));',
			'};',
		].join('\n');
		const files = mkMap({
			'plugins/example/src/lib/wait.ts': pluginBody,
			'packages/core/src/lib/util/wait.ts': coreBody,
		});
		const result = await classifySolidFindings(process.cwd(), files);
		const mags = result.findings.filter(
			(f) => f.id === 'magic-number-in-plugin',
		);
		expect(mags).toHaveLength(1);
		expect(mags[0]?.relPath).toBe('plugins/example/src/lib/wait.ts');
		expect(mags[0]?.message).toMatch(/12345/);
	});

	it('catch-swallow: empty catch {} flagged', async () => {
		const body = [
			'export const safe = async (): Promise<void> => {',
			'  try {',
			'    await doThing();',
			'  } catch {}',
			'};',
		].join('\n');
		const files = mkMap({ 'plugins/example/src/lib/safe.ts': body });
		const result = await classifySolidFindings(process.cwd(), files);
		const swallows = result.findings.filter(
			(f) => f.id === 'catch-swallow',
		);
		expect(swallows).toHaveLength(1);
		expect(swallows[0]?.line).toBe(4);
	});

	it('duplicated-cross-plugin: identical 8-line block in two plugin files flagged', async () => {
		const duplicatedBlock = [
			'export const helper = (x: number): number => {',
			'  if (x < 0) return 0;',
			'  if (x > 100) return 100;',
			'  return x * 2;',
			'};',
			'',
			'// extra padding to fill 8 lines',
			'export const _marker = true;',
		].join('\n');
		const files = mkMap({
			'plugins/foo/src/lib/h.ts': duplicatedBlock,
			'plugins/bar/src/lib/h.ts': duplicatedBlock,
		});
		const result = await classifySolidFindings(process.cwd(), files, {
			minDupCopies: 2,
		});
		const dups = result.findings.filter(
			(f) => f.id === 'duplicated-cross-plugin',
		);
		expect(dups.length).toBeGreaterThanOrEqual(2);
		const relPaths = new Set(dups.map((d) => d.relPath));
		expect(relPaths.size).toBe(2);
	});

	it('does not flag duplicate blocks within one plugin', async () => {
		const duplicatedBlock = [
			'export const helper = (x: number): number => {',
			'  if (x < 0) return 0;',
			'  if (x > 100) return 100;',
			'  return x * 2;',
			'};',
			'',
			'// extra padding to fill 8 lines',
			'export const _marker = true;',
		].join('\n');
		const files = mkMap({
			'plugins/foo/src/lib/one.ts': duplicatedBlock,
			'plugins/foo/src/lib/two.ts': duplicatedBlock,
		});
		const result = await classifySolidFindings(process.cwd(), files, {
			minDupCopies: 2,
		});
		expect(
			result.findings.filter((f) => f.id === 'duplicated-cross-plugin'),
		).toHaveLength(0);
	});

	it('formatReport: empty findings produces clean output', () => {
		const result: ISolidScanResult = {
			rootDir: '/tmp',
			findings: [],
			scannedFiles: 0,
			elapsedMs: 0,
		};
		expect(formatReport(result)).toMatch(/no findings/);
	});
});
