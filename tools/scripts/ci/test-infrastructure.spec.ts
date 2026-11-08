import { describe, expect, it } from 'vitest';

import {
	affectedSpecs,
	testInfrastructureSpecsOf,
} from './affected-specs.service';
import { setupFilesOf, testInfrastructureSpecs } from './test-infrastructure';

const SPECS = [
	'packages/core/a.spec.ts',
	'plugins/x/b.spec.ts',
	'tools/scripts/c.spec.ts',
];
const none = new Set<string>();

describe('setupFilesOf', () => {
	it('reads the tracked setup files the shared config names', () => {
		const config = `[
			resolve(root, 'tools/lib/quiet-setup.ts'),
			'tools/test/identity-setup.ts',
			'tools/lib/gone-setup.ts',
		]`;
		expect(
			setupFilesOf(config, [
				'tools/lib/quiet-setup.ts',
				'tools/test/identity-setup.ts',
			]),
		).toEqual(['tools/lib/quiet-setup.ts', 'tools/test/identity-setup.ts']);
		expect(setupFilesOf(undefined, [])).toEqual([]);
	});
});

describe('a change to the test setup selects every spec it reaches', () => {
	const reach = (changed: readonly string[], kitReached = none) =>
		testInfrastructureSpecs({
			changed,
			specs: [...SPECS, 'packages/core/src/x.ts'],
			setupClosure: new Set([
				'tools/test/identity-setup.ts',
				'packages/core/c.ts',
			]),
			kitReached,
		});

	it.each([
		'vitest.shared.ts',
		'vitest.config.ts',
		'tsconfig.base.json',
		'tsconfig.json',
		'tools/test/identity-setup.ts',
		'packages/core/c.ts',
	])('%s reaches every spec', (path) => {
		expect(reach([path])).toEqual(SPECS);
	});

	it("a workspace's vitest config or tsconfig reaches its own specs", () => {
		expect(reach(['plugins/x/vitest.config.ts'])).toEqual([
			'plugins/x/b.spec.ts',
		]);
		expect(reach(['packages/core/tsconfig.json'])).toEqual([
			'packages/core/a.spec.ts',
		]);
	});

	it('a test-kit change reaches the specs its symbols reach', () => {
		expect(
			reach(
				['packages/test-kit/src/lib/h.ts'],
				new Set(['tools/scripts/c.spec.ts']),
			),
		).toEqual(['tools/scripts/c.spec.ts']);
	});

	it('anything else reaches nothing through the setup', () => {
		expect(reach(['packages/core/src/x.ts', 'docs/a.md'])).toEqual([]);
	});
});

describe('the analysis follows the setup into what it imports', () => {
	const text: Record<string, string> = {
		'vitest.shared.ts':
			"export const s = ['tools/test/identity-setup.ts'];",
		'tools/test/identity-setup.ts':
			"import { MARKERS } from '../../packages/core/markers';\nclear(MARKERS);",
		'packages/core/markers.ts': "export const MARKERS = ['A'];",
		'packages/core/other.ts': 'export const other = 1;',
		'packages/test-kit/src/lib/h.ts': 'export const helper = 1;',
		'packages/test-kit/src/index.ts': "export { helper } from './lib/h';",
		'packages/core/a.spec.ts': "import { other } from './other';",
		'plugins/x/b.spec.ts':
			"import { helper } from '../../packages/test-kit/src/index';",
	};
	const input = (changed: readonly string[]) => ({
		files: Object.keys(text),
		changed,
		read: (file: string) => text[file] ?? '',
		paths: {},
		setupFiles: ['tools/test/identity-setup.ts'],
	});

	it('a constant a setup file imports reaches every spec, which import none of it', () => {
		expect(affectedSpecs(input(['packages/core/markers.ts']))).toEqual([
			'packages/core/a.spec.ts',
			'plugins/x/b.spec.ts',
		]);
	});

	it('the touched scope selects the specs a test-kit change reaches', () => {
		expect(
			testInfrastructureSpecsOf(
				input(['packages/test-kit/src/lib/h.ts']),
			),
		).toEqual(['plugins/x/b.spec.ts']);
	});

	it('a source outside the setup still reaches only its own users', () => {
		expect(affectedSpecs(input(['packages/core/other.ts']))).toEqual([
			'packages/core/a.spec.ts',
		]);
	});
});
