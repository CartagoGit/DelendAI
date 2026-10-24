import { describe, expect, it } from 'vitest';

import {
	detectAbsoluteLocalImports,
	findAbsoluteLocalImports,
	formatReport,
	isAbsoluteLocalSpecifier,
} from './no-absolute-local-imports.script';

describe('isAbsoluteLocalSpecifier', () => {
	it('rejects POSIX-absolute and Windows-drive specifiers', () => {
		expect(isAbsoluteLocalSpecifier('/home/someone/repo/src/a')).toBe(true);
		expect(isAbsoluteLocalSpecifier('C:\\repo\\src\\a')).toBe(true);
		expect(isAbsoluteLocalSpecifier('D:/repo/src/a')).toBe(true);
	});

	it('leaves every portable specifier alone', () => {
		for (const specifier of [
			'./sibling',
			'../parent/thing',
			'vitest',
			'@delendai/core/public',
			'node:fs',
			'bun:test',
			'https://esm.sh/preact',
		]) {
			expect(isAbsoluteLocalSpecifier(specifier)).toBe(false);
		}
	});
});

describe('findAbsoluteLocalImports', () => {
	it('catches the shape that actually reached develop', () => {
		// A generated spec imported its own sibling by absolute path, so
		// local typecheck passed and CI failed with TS2307.
		const findings = findAbsoluteLocalImports(
			[
				"import { describe } from 'vitest';",
				'import {',
				'\tcreateAssembledProposalsServer,',
				"} from '/home/someone/repo/plugins/proposals/tests/e2e/assembled-proposals-server';",
			].join('\n'),
			'plugins/proposals/tests/e2e/flow.spec.ts',
		);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.line).toBe(4);
		expect(findings[0]?.specifier).toContain('/home/someone/repo');
	});

	it('catches side-effect imports, dynamic imports and require', () => {
		const findings = findAbsoluteLocalImports(
			[
				"import '/abs/side-effect';",
				"const mod = await import('/abs/dynamic');",
				"const legacy = require('/abs/legacy');",
			].join('\n'),
			'x.ts',
		);
		expect(findings.map((entry) => entry.line)).toEqual([1, 2, 3]);
	});

	it('ignores commented-out lines and portable specifiers', () => {
		const findings = findAbsoluteLocalImports(
			[
				"// import '/abs/commented';",
				" * from '/abs/in-a-doc-block'",
				"import { a } from './relative';",
				"import { b } from '@delendai/core/public';",
				"import { readFile } from 'node:fs/promises';",
			].join('\n'),
			'x.ts',
		);
		expect(findings).toEqual([]);
	});
});

describe('formatReport', () => {
	it('states the failure mode, not just the count', () => {
		const report = formatReport([
			{ file: 'a.ts', line: 3, specifier: '/abs/x' },
		]);
		expect(report).toContain('a.ts:3');
		expect(report).toContain('TS2307');
	});
});

describe('the repository itself', () => {
	it('has no machine-absolute import specifier', async () => {
		expect(await detectAbsoluteLocalImports()).toEqual([]);
	}, 120_000);
});
