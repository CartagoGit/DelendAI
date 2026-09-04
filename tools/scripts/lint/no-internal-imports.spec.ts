#!/usr/bin/env bun
/**
 * no-internal-imports.spec.ts — b00238 (Track N / q00006 §50).
 *
 * Unit tests for the `*Internal` / `@delendai/core/_internal`
 * naming-convention enforcement. Uses a temp directory so the
 * production tree is not touched.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	detectInternalImports,
	formatReport,
	scanText,
} from './no-internal-imports.script';

const makeTmpTree = async (files: Record<string, string>): Promise<string> => {
	const root = join(
		tmpdir(),
		`no-internal-imports-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
	await mkdir(root, { recursive: true });
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel);
		await mkdir(join(abs, '..'), { recursive: true });
		await writeFile(abs, content, 'utf8');
	}
	return root;
};

let rootsToCleanup: string[] = [];

beforeEach(() => {
	rootsToCleanup = [];
});

afterEach(async () => {
	for (const r of rootsToCleanup) {
		await rm(r, { recursive: true, force: true });
	}
});

const trackRoot = (r: string): string => {
	rootsToCleanup.push(r);
	return r;
};

describe('no-internal-imports.script (b00238)', () => {
	describe('scanText', () => {
		it('flags `*Internal` named imports', () => {
			const findings = scanText(
				`import { fooInternal } from "@delendai/core/public";\n`,
				'/repo/plugins/x/src/index.ts',
				'plugins/x/src/index.ts',
			);
			expect(findings).toHaveLength(1);
			expect(findings[0]?.kind).toBe('named-internal');
			expect(findings[0]?.specifier).toBe('@delendai/core/public');
			expect(findings[0]?.symbol).toBe('fooInternal');
			expect(findings[0]?.reason).toContain('internal');
		});

		it('flags `*Internal` named exports', () => {
			const findings = scanText(
				`export { barInternal } from "@delendai/core/public";\n`,
				'/repo/plugins/x/src/index.ts',
				'plugins/x/src/index.ts',
			);
			expect(findings).toHaveLength(1);
			expect(findings[0]?.symbol).toBe('barInternal');
		});

		it('flags @delendai/core/_internal subpath imports', () => {
			const findings = scanText(
				`import { x } from "@delendai/core/_internal/foo";\n`,
				'/repo/plugins/x/src/index.ts',
				'plugins/x/src/index.ts',
			);
			expect(findings).toHaveLength(1);
			expect(findings[0]?.kind).toBe('subpath-internal');
			expect(findings[0]?.specifier).toBe('@delendai/core/_internal/foo');
		});

		it('does not flag public names', () => {
			const findings = scanText(
				[
					`import { foo } from "@delendai/core/public";\n`,
					`import type { IBar } from "@delendai/core/contracts";\n`,
					`export const x = 1;\n`,
				].join(''),
				'/repo/plugins/x/src/index.ts',
				'plugins/x/src/index.ts',
			);
			expect(findings).toEqual([]);
		});

		it('permits internal imports inside packages/core', () => {
			const findings = scanText(
				[
					`import { fooInternal } from "@delendai/core/public";`,
					`import { x } from "@delendai/core/_internal/foo";`,
				].join('\n'),
				'/repo/packages/core/src/public/index.ts',
				'packages/core/src/public/index.ts',
			);
			expect(findings).toEqual([]);
		});

		it('skips line comments even when they mention *Internal', () => {
			const findings = scanText(
				`// fooInternal is mentioned here for context\nimport { foo } from "@delendai/core/public";\n`,
				'/repo/plugins/x/src/index.ts',
				'plugins/x/src/index.ts',
			);
			expect(findings).toEqual([]);
		});

		it('handles multi-line named imports', () => {
			const findings = scanText(
				[
					`import {`,
					`  foo,`,
					`  barInternal,`,
					`} from "@delendai/core/public";`,
				].join('\n'),
				'/repo/plugins/x/src/index.ts',
				'plugins/x/src/index.ts',
			);
			expect(findings).toHaveLength(1);
			expect(findings[0]?.symbol).toBe('barInternal');
		});
	});

	describe('detectInternalImports (temp tree)', () => {
		it('finds a violation in a nested file', async () => {
			const root = trackRoot(
				await makeTmpTree({
					'ok.ts': `import { x } from "@delendai/core/public";\n`,
					'bad.ts': `import { fooInternal } from "@delendai/core/public";\n`,
					'nested/also-bad.ts': `import type { X } from "@delendai/core/_internal/y";\n`,
				}),
			);
			const findings = await detectInternalImports(root);
			expect(findings).toHaveLength(2);
			const named = findings.find((f) => f.kind === 'named-internal');
			const subpath = findings.find((f) => f.kind === 'subpath-internal');
			expect(named?.specifier).toBe('@delendai/core/public');
			expect(named?.symbol).toBe('fooInternal');
			expect(subpath?.specifier).toBe('@delendai/core/_internal/y');
		});

		it('returns [] when the tree is clean', async () => {
			const root = trackRoot(
				await makeTmpTree({
					'clean.ts': `import { foo } from "@delendai/core/public";\n`,
				}),
			);
			const findings = await detectInternalImports(root);
			expect(findings).toEqual([]);
		});

		it('permits violations-shaped imports in packages/core paths', async () => {
			const root = trackRoot(
				await makeTmpTree({
					'packages/core/src/internal.ts': [
						`import { fooInternal } from "@delendai/core/public";`,
						`import { x } from "@delendai/core/_internal/y";`,
					].join('\n'),
				}),
			);
			const findings = await detectInternalImports(root);
			expect(findings).toEqual([]);
		});
	});

	describe('formatReport', () => {
		it('prints a violation table', () => {
			const out = formatReport([
				{
					absPath: '/repo/plugins/x/src/index.ts',
					relPath: 'plugins/x/src/index.ts',
					line: 3,
					specifier: '@delendai/core/public',
					symbol: 'fooInternal',
					kind: 'named-internal',
					reason: 'internal',
				},
			]);
			expect(out).toContain('1 violation');
			expect(out).toContain('plugins/x/src/index.ts');
			expect(out).toContain('fooInternal');
		});

		it('prints 0 violations header when clean', () => {
			expect(formatReport([])).toBe('no-internal-imports: 0 violations.');
		});
	});
});
