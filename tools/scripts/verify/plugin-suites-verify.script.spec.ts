import { describe, expect, it, vi } from 'vitest';

import {
	verifyPluginSuites,
	buildPluginTestCommand,
	buildVitestArgs,
	discoverPluginTestSuites,
	type IPluginTestSuite,
} from './plugin-suites-verify.script';

describe('plugin suite matrix', () => {
	it('discovers every plugin suite from the workspace', async () => {
		const suites = await discoverPluginTestSuites(process.cwd());

		expect(suites.length).toBeGreaterThan(0);
		expect(suites.map((suite) => suite.id)).toEqual(
			[...suites].map((suite) => suite.id).sort(),
		);
		for (const suite of suites) {
			expect(suite.testFiles.length, suite.id).toBeGreaterThan(0);
		}
	});

	it('builds one explicit Vitest command containing every discovered file', () => {
		const suites: readonly IPluginTestSuite[] = [
			{
				id: 'alpha',
				packagePath: '/repo/plugins/alpha/package.json',
				testFiles: ['plugins/alpha/tests/a.spec.ts'],
			},
			{
				id: 'beta',
				packagePath: '/repo/plugins/beta/package.json',
				testFiles: [
					'plugins/beta/tests/b.spec.ts',
					'plugins/beta/tests/c.test.ts',
				],
			},
		];

		expect(buildVitestArgs(suites)).toEqual([
			'vitest',
			'run',
			'plugins/alpha/tests/a.spec.ts',
			'plugins/beta/tests/b.spec.ts',
			'plugins/beta/tests/c.test.ts',
		]);
	});

	it('runs each plugin through its own package test process', () => {
		expect(
			buildPluginTestCommand({
				id: 'proposals',
				packagePath: '/repo/plugins/proposals/package.json',
				testFiles: [
					'plugins/proposals/tests/src/lib/auto-work.spec.ts',
				],
			}),
		).toEqual(['run', '--cwd', 'plugins/proposals', 'test']);
	});

	it('checks that each plugin owns a suite without running them again', async () => {
		const written = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation(() => true);
		expect(await verifyPluginSuites(process.cwd())).toBe(0);
		expect(String(written.mock.calls[0]?.[0])).toContain(
			'each own a test suite',
		);
		written.mockRestore();
	});
});
