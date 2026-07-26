import { describe, expect, it } from 'vitest';

import {
	collectMassContentRemovalFindings,
	parseDeletedFilesFromDiff,
	summarizeMassContentRemoval,
} from '../../../../../tools/scripts/lint/mass-content-removal.script';

describe('mass-content-removal lint (a00074 S4)', () => {
	it('passes when there are zero tracked deletions', () => {
		expect(
			summarizeMassContentRemoval({
				branch: 'agent/x',
				deletedFiles: [],
			}),
		).toBeNull();
	});

	it('passes when there is a single tracked deletion', () => {
		expect(
			summarizeMassContentRemoval({
				branch: 'agent/x',
				deletedFiles: ['plugins/search/src/lib/tools/one.ts'],
			}),
		).toBeNull();
	});

	it('fails with same-agent-mass-removal once the threshold is reached', () => {
		const finding = summarizeMassContentRemoval({
			branch: 'agent/x',
			deletedFiles: [
				'plugins/search/src/lib/tools/a.ts',
				'plugins/search/src/lib/tools/b.ts',
				'plugins/search/src/lib/tools/c.ts',
				'plugins/search/src/lib/tools/d.ts',
				'packages/core/src/lib/tools/e.ts',
			],
		});
		expect(finding).toEqual({
			branch: 'agent/x',
			code: 'same-agent-mass-removal',
			count: 5,
			deletedFiles: [
				'plugins/search/src/lib/tools/a.ts',
				'plugins/search/src/lib/tools/b.ts',
				'plugins/search/src/lib/tools/c.ts',
				'plugins/search/src/lib/tools/d.ts',
				'packages/core/src/lib/tools/e.ts',
			],
		});
	});

	it('filters ignored and out-of-scope deletions before counting', () => {
		expect(
			parseDeletedFilesFromDiff(
				[
					'plugins/search/src/lib/tools/a.ts',
					'plugins/search/dist/b.ts',
					'packages/core/src/lib/c.ts',
					'packages/core/coverage/d.ts',
					'readme.md',
				].join('\n'),
			),
		).toEqual([
			'packages/core/src/lib/c.ts',
			'plugins/search/src/lib/tools/a.ts',
		]);
	});

	it('collects findings per branch from git diff output', () => {
		const findings = collectMassContentRemovalFindings({
			branches: ['agent/clean', 'agent/noisy'],
			git: {
				run: (args) => {
					const branch = args[3]?.replace('develop..', '');
					if (branch === 'agent/clean') {
						return {
							ok: true,
							output: 'plugins/search/src/lib/tools/a.ts\n',
						};
					}
					return {
						ok: true,
						output: [
							'plugins/search/src/lib/tools/a.ts',
							'plugins/search/src/lib/tools/b.ts',
							'plugins/search/src/lib/tools/c.ts',
							'plugins/search/src/lib/tools/d.ts',
							'packages/core/src/lib/e.ts',
						].join('\n'),
					};
				},
			},
		});
		expect(findings).toEqual([
			{
				branch: 'agent/noisy',
				code: 'same-agent-mass-removal',
				count: 5,
				deletedFiles: [
					'packages/core/src/lib/e.ts',
					'plugins/search/src/lib/tools/a.ts',
					'plugins/search/src/lib/tools/b.ts',
					'plugins/search/src/lib/tools/c.ts',
					'plugins/search/src/lib/tools/d.ts',
				],
			},
		]);
	});
});
