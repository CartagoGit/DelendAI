import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import {
	DEFAULT_CONVENTION,
	mergeConvention,
	scanDrift,
} from '@mcp-vertex/test-convention/public';

const fakeReader = (files: Record<string, string>): IFileReader => {
	const keys = Object.keys(files);
	return {
		readFile: async (p) => files[p],
		exists: async (p) => p in files,
		listDir: async () => keys,
	};
};

describe('scanDrift', async () => {
	it('reports ok when there are no violations', async () => {
		const reader = fakeReader({
			'src/lib/foo.ts': 'export const foo = 1;',
			'src/lib/foo.spec.ts':
				'describe("foo", async () => { it("a", async () => {}); });',
		});
		const report = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
		});
		expect(report.ok).toBe(true);
		expect(report.counts.error).toBe(0);
	});

	it('flags wrong-spec-extension and missing-top-level-describe', async () => {
		const reader = fakeReader({
			'src/lib/bad.test.ts': "it('does a thing', async () => {});",
		});
		const c = mergeConvention({ specExtension: 'spec.ts' });
		const report = await scanDrift({
			convention: c,
			reader,
			workspaceRoot: '/',
		});
		const ids = report.violations.map((v) => v.id);
		expect(ids).toContain('wrong-spec-extension');
		expect(ids).toContain('missing-top-level-describe');
	});

	it('flags missing-spec-for-export when source has exports but no spec', async () => {
		const reader = fakeReader({
			'src/lib/orphan.ts': 'export function orphan() {}',
		});
		const report = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
		});
		expect(
			report.violations.some((v) => v.id === 'missing-spec-for-export'),
		).toBe(true);
	});

	it('flags forbidden patterns (.only, xit, @ts-ignore, console.log)', async () => {
		const reader = fakeReader({
			'src/lib/x.spec.ts': [
				'describe("x", async () => {',
				'  it.only("a", async () => { console.log("debug"); });',
				'  // @ts-ignore',
				'  xit("skipped", async () => {});',
				'});',
			].join('\n'),
		});
		const report = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
		});
		const ids = report.violations.map((v) => v.id);
		expect(ids).toContain('forbidden-only');
		expect(ids).toContain('forbidden-ts-ignore');
		expect(ids).toContain('forbidden-skip');
		expect(ids).toContain('console-residue');
	});

	it('flags wrong-mock-api when jest.fn appears in a vitest project', async () => {
		const reader = fakeReader({
			'src/lib/j.spec.ts':
				'describe("j", async () => { it("a", async () => { jest.fn(); }); });',
		});
		const report = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
		});
		expect(report.violations.some((v) => v.id === 'wrong-mock-api')).toBe(
			true,
		);
	});

	it('flags orphan-spec when the import does not resolve', async () => {
		const reader = fakeReader({
			'src/lib/j.spec.ts':
				'import { x } from "./missing"; describe("j", async () => { it("a", async () => {}); });',
		});
		const report = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
		});
		expect(report.violations.some((v) => v.id === 'orphan-spec')).toBe(
			true,
		);
	});

	it('counts severities correctly', async () => {
		const reader = fakeReader({
			'src/lib/a.spec.ts': 'describe.only("a", async () => {});',
		});
		const report = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
		});
		expect(report.counts.error).toBeGreaterThanOrEqual(2);
		expect(report.ok).toBe(false);
	});

	it('respects scope=src and scope=tests', async () => {
		const reader = fakeReader({
			'src/lib/a.ts': 'export const a = 1;',
			'src/lib/a.spec.ts':
				'describe("a", async () => { it("x", async () => {}); });',
			'src/lib/b.spec.ts': 'describe.only("b", async () => {});',
		});
		const srcOnly = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
			scope: 'src',
		});
		expect(srcOnly.scannedFiles).toBe(1);

		const testsOnly = await scanDrift({
			convention: DEFAULT_CONVENTION,
			reader,
			workspaceRoot: '/',
			scope: 'tests',
		});
		expect(testsOnly.scannedFiles).toBe(2);
	});
});
