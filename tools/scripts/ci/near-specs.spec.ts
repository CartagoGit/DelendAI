/**
 * near-specs.spec.ts — the local proof runs the specs nearest a change.
 */
import { describe, expect, it } from 'vitest';

import {
	consumerSpecs,
	isNearSource,
	nearSpecs,
	readerSpecs,
} from './near-specs';

const SPECS = [
	'packages/core/tests/src/lib/a/widget.service.spec.ts',
	'plugins/x/tests/src/widget.service.spec.ts',
	'packages/core/tests/src/lib/b/other.spec.ts',
	'tools/scripts/ci/plan.spec.ts',
];

describe('nearSpecs', () => {
	it('[<50ms] takes a changed spec, the specs named after a source and its importers', () => {
		const importers: Record<string, readonly string[]> = {
			'widget.service': ['packages/core/tests/src/lib/b/other.spec.ts'],
		};
		expect(
			nearSpecs(
				[
					'packages/core/src/lib/a/widget.service.ts',
					'tools/scripts/ci/plan.spec.ts',
				],
				SPECS,
				(stem) => importers[stem] ?? [],
			),
		).toEqual([
			'packages/core/tests/src/lib/a/widget.service.spec.ts',
			'packages/core/tests/src/lib/b/other.spec.ts',
			'plugins/x/tests/src/widget.service.spec.ts',
			'tools/scripts/ci/plan.spec.ts',
		]);
	});

	it('[<50ms] takes the e2e tier of a spec named after the source, so moving a spec there keeps its coverage', () => {
		const specs = [
			'packages/core/tests/src/lib/a/widget.service.e2e.spec.ts',
			'packages/core/tests/src/lib/a/gadget.service.e2e.spec.ts',
		];
		expect(
			nearSpecs(
				['packages/core/src/lib/a/widget.service.ts'],
				specs,
				() => [],
			),
		).toEqual(['packages/core/tests/src/lib/a/widget.service.e2e.spec.ts']);
	});

	it('[<50ms] looks nothing up for prose, configuration, locale leaves or a deleted spec', () => {
		const asked: string[] = [];
		expect(
			nearSpecs(
				[
					'README.md',
					'delendai.config.json',
					'apps/web/src/i18n/tools/x/delendai_x.ts',
					'packages/core/tests/src/lib/gone.spec.ts',
				],
				SPECS,
				(stem) => {
					asked.push(stem);
					return [];
				},
			),
		).toEqual([]);
		expect(asked).toEqual([]);
	});

	it('[<50ms] reaches a file no spec names through the sources that import it', () => {
		expect(
			nearSpecs(
				['packages/cli/src/lib/list.generated.ts'],
				['packages/cli/tests/list-reader.spec.ts'],
				() => [],
				(stem) =>
					stem === 'list.generated'
						? ['packages/cli/src/lib/list-reader.ts']
						: [],
			),
		).toEqual(['packages/cli/tests/list-reader.spec.ts']);
	});

	it('[<50ms] knows which paths are sources', () => {
		expect(isNearSource('plugins/x/src/a.ts')).toBe(true);
		expect(isNearSource('docs/a.md')).toBe(false);
		expect(isNearSource('apps/web/src/i18n/tools/index.ts')).toBe(false);
	});
});

describe('readerSpecs', () => {
	it('[<50ms] takes the specs on record reading a changed file, in every zone', () => {
		const map = {
			zones: {
				tools: {
					read: ['docs/BUDGETS.md'],
					listed: [],
					specs: {
						'tools/report.spec.ts': {
							read: ['docs/BUDGETS.md'],
							listed: [],
						},
						'tools/other.spec.ts': {
							read: ['docs/x.md'],
							listed: [],
						},
					},
				},
			},
		};
		expect(readerSpecs(['docs/BUDGETS.md'], map)).toEqual([
			'tools/report.spec.ts',
		]);
		expect(readerSpecs(['docs/BUDGETS.md'], undefined)).toEqual([]);
	});

	it('[<50ms] selects for a pure review batch only the specs that read its proposals, in no zone wholesale', () => {
		const reads = (
			read: readonly string[],
			listed: readonly string[] = [],
		) => ({
			read: [...read],
			listed: [...listed],
		});
		const proposal = 'docs/delendai/proposals/review/x01001-a.md';
		const map = {
			zones: {
				core: {
					...reads([proposal]),
					specs: {
						'packages/core/a.spec.ts': reads([proposal]),
						'packages/core/b.spec.ts': reads([]),
					},
				},
				proposals: {
					...reads([proposal]),
					specs: {
						'plugins/proposals/lint.spec.ts': reads([proposal]),
						'plugins/proposals/c.spec.ts': reads(['src/c.ts']),
					},
				},
				tools: {
					...reads([]),
					specs: { 'tools/t.spec.ts': reads([]) },
				},
			},
		};
		expect(readerSpecs([proposal], map)).toEqual([
			'packages/core/a.spec.ts',
			'plugins/proposals/lint.spec.ts',
		]);
	});
});

describe('consumerSpecs', () => {
	const sources: Record<string, string> = {
		'plugins/p/src/tools/create_proposal.tool.ts':
			'export const createProposal = 1;',
		'plugins/p/src/tools/index.ts':
			"export { createProposal } from './create_proposal.tool';",
		'plugins/p/src/authoring.ts': "export * from './tools';",
		'plugins/p/src/uses.spec.ts':
			"import { createProposal } from './authoring';",
		'plugins/p/src/deep.spec.ts': "import { uses } from './uses';",
		'plugins/p/src/uses.ts':
			"import { createProposal } from './authoring';",
		'packages/cli/src/lib/work-deliver.service.ts': 'export const w = 1;',
		'packages/cli/src/commands/work.command.ts':
			"import { w } from '../lib/work-deliver.service';",
		'packages/cli/src/lib/startup-budget.spec.ts': 'it',
		'extensions/vscode/src/extension.ts': 'export const a = 1;',
		'extensions/vscode/src/test/build-smoke.e2e.spec.ts': 'it',
	};
	const inputOf = (changed: string[]) => ({
		files: Object.keys(sources),
		changed,
		read: (file: string) => sources[file] ?? '',
		paths: {},
	});

	it('[<50ms] reaches a consumer behind a barrel, and no further', () => {
		expect(
			consumerSpecs(
				inputOf(['plugins/p/src/tools/create_proposal.tool.ts']),
			),
		).toEqual(['plugins/p/src/uses.spec.ts']);
	});

	it('[<50ms] reaches the declared readers through the module graph and by folder', () => {
		expect(
			consumerSpecs(
				inputOf(['packages/cli/src/lib/work-deliver.service.ts']),
			),
		).toEqual(['packages/cli/src/lib/startup-budget.spec.ts']);
		expect(
			consumerSpecs(inputOf(['extensions/vscode/src/extension.ts'])),
		).toEqual(['extensions/vscode/src/test/build-smoke.e2e.spec.ts']);
		expect(consumerSpecs(inputOf(['docs/a.md']))).toEqual([]);
	});
});
