import { describe, expect, it } from 'vitest';

import {
	findTestSupportImports,
	formatReport,
	isProductionSource,
	isTestSupportSpecifier,
} from './no-test-support-in-production.script';

// Built in parts so this spec's own text is not read as an import of the
// kit by text-scanning lints.
const TEST_KIT = ['@delendai', 'test-kit'].join('/');

describe('isProductionSource', () => {
	it.each([
		['packages/core/src/lib/x.ts', true],
		['plugins/demo/src/lib/tools/a.tool.ts', true],
		['packages/client/src/view.tsx', true],
		['packages/core/src/lib/x.spec.ts', false],
		['packages/core/src/lib/x.test.tsx', false],
		['plugins/demo/src/lib/testing/fake.helper.ts', false],
		['plugins/demo/src/lib/fixtures/sample.ts', false],
		['packages/core/tests/src/lib/x.ts', false],
		['packages/test-kit/src/index.ts', false],
		['tools/scripts/lint/a.script.ts', false],
		['packages/core/src/lib/data.json', false],
	])('%s → %s', (path, expected) => {
		expect(isProductionSource(path)).toBe(expected);
	});
});

describe('isTestSupportSpecifier', () => {
	it.each([
		[TEST_KIT, true],
		[`${TEST_KIT}/public`, true],
		['../../testing/fake.helper', true],
		['../tests/helpers', true],
		['./widget.spec', true],
		['../../../test-kit/src/index', true],
		[`${TEST_KIT}-extras`, false],
		['@delendai/core/public', false],
		['./testimonials', false],
		['node:test', false],
	])('%s → %s', (specifier, expected) => {
		expect(isTestSupportSpecifier(specifier)).toBe(expected);
	});
});

describe('findTestSupportImports', () => {
	it('flags static, side-effect, dynamic and multi-line imports with their lines', () => {
		const text = [
			`import { createFakeToolServer } from '${TEST_KIT}/public';`,
			"import '../testing/setup';",
			"const m = await import('./thing.spec');",
			'import {',
			'\ta,',
			"} from '../tests/helpers';",
		].join('\n');
		expect(findTestSupportImports(text, 'packages/x/src/a.ts')).toEqual([
			{
				file: 'packages/x/src/a.ts',
				line: 1,
				specifier: `${TEST_KIT}/public`,
			},
			{
				file: 'packages/x/src/a.ts',
				line: 2,
				specifier: '../testing/setup',
			},
			{ file: 'packages/x/src/a.ts', line: 3, specifier: './thing.spec' },
			{
				file: 'packages/x/src/a.ts',
				line: 6,
				specifier: '../tests/helpers',
			},
		]);
	});

	it('ignores comments and imports described inside strings', () => {
		const text = [
			`// import { x } from '${TEST_KIT}';`,
			` * import { x } from '${TEST_KIT}';`,
			`const doc = "import { x } from '${TEST_KIT}'";`,
		].join('\n');
		expect(findTestSupportImports(text, 'packages/x/src/a.ts')).toEqual([]);
	});
});

describe('formatReport', () => {
	it('refuses to call an empty scan clean', () => {
		expect(formatReport([], 0)).toContain('not evidence of a clean tree');
	});

	it('names each offender and the way out', () => {
		const report = formatReport(
			[{ file: 'packages/x/src/a.ts', line: 3, specifier: TEST_KIT }],
			10,
		);
		expect(report).toContain('packages/x/src/a.ts:3');
		expect(report).toContain('code that ships may not');
	});

	it('reports how much it read when clean', () => {
		expect(formatReport([], 42)).toContain('42 production file(s)');
	});
});
