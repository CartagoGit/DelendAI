import { describe, expect, it } from 'vitest';

import {
	CORPUS_PATHSPECS,
	declarationHeadOf,
	findToolBuilders,
	findUnregisteredToolBuilders,
	formatReport,
	gitListTrackedFiles,
	isTestFile,
	loadCorpus,
	readWorkspaceFile,
	referencesSymbol,
	usedWithinOwnFile,
	UNREGISTERED_TOOL_EXCLUSIONS,
	type ISourceFile,
	type IUnregisteredToolExclusion,
} from './unregistered-tools.script';

const builderFile = (path: string, symbol: string): ISourceFile => ({
	path,
	text: [
		"import type { IToolRegistration } from '@delendai/core/public';",
		'',
		`export const ${symbol} = (`,
		'\toptions: IOptions,',
		'): IToolRegistration => {',
		"\treturn { id: 'x', register: async () => {} };",
		'};',
	].join('\n'),
});

describe('isTestFile', () => {
	it('recognises spec, test and tests-tree files', () => {
		expect(isTestFile('plugins/p/tests/src/a.spec.ts')).toBe(true);
		expect(isTestFile('plugins/p/src/a.test.ts')).toBe(true);
		expect(isTestFile('tests/e2e/a.ts')).toBe(true);
	});

	it('does not mistake production source for a test', () => {
		expect(isTestFile('plugins/p/src/index.ts')).toBe(false);
		expect(isTestFile('plugins/p/src/lib/tools/latest.tool.ts')).toBe(
			false,
		);
	});
});

describe('declarationHeadOf', () => {
	it('cuts at the arrow body, so a neighbour docblock cannot bleed in', () => {
		const head = declarationHeadOf(
			'export const buildX = (o: O): IToolRegistration => {\n\t// IToolRegistration mentioned in the body\n};',
		);
		expect(head).toContain('IToolRegistration');
		expect(head).not.toContain('in the body');
	});

	it('cuts a plain constant at its terminating semicolon', () => {
		const head = declarationHeadOf(
			[
				'export const IDS: readonly string[] = withLevel();',
				'',
				'/**',
				' * ... IToolRegistration.disclosure ...',
				' */',
			].join('\n'),
		);
		expect(head).not.toContain('IToolRegistration');
	});
});

describe('findToolBuilders', () => {
	it('finds an exported builder under plugins/*/src', () => {
		expect(
			findToolBuilders(
				builderFile('plugins/p/src/lib/tools/a.tool.ts', 'buildA'),
			),
		).toEqual(['buildA']);
	});

	it('ignores packages, apps and tools trees', () => {
		expect(
			findToolBuilders(
				builderFile('packages/core/src/lib/a.ts', 'buildA'),
			),
		).toEqual([]);
	});

	it('ignores test files even under a plugin src tree', () => {
		expect(
			findToolBuilders(
				builderFile('plugins/p/src/lib/a.spec.ts', 'buildA'),
			),
		).toEqual([]);
	});

	it('ignores a constant that merely sits above a documented builder', () => {
		const file: ISourceFile = {
			path: 'plugins/p/src/lib/surface/disclosure.ts',
			text: [
				'export const ESSENTIAL_IDS: readonly string[] = idsWithLevel();',
				'',
				'/**',
				' * Static disclosure tag for one registration, for wiring',
				' * into `IToolRegistration.disclosure`.',
				' */',
				'export const tagFor = (id: string): string => id;',
			].join('\n'),
		};
		expect(findToolBuilders(file)).toEqual([]);
	});
});

describe('referencesSymbol', () => {
	it('matches on a word boundary, not a substring', () => {
		expect(referencesSymbol('buildA(options)', 'buildA')).toBe(true);
		expect(referencesSymbol('buildAlpha(options)', 'buildA')).toBe(false);
	});
});

describe('usedWithinOwnFile', () => {
	it('is false when the only occurrence is the declaration itself', () => {
		expect(
			usedWithinOwnFile(
				builderFile('plugins/p/src/lib/tools/a.tool.ts', 'buildA'),
				'buildA',
			),
		).toBe(false);
	});

	it('is true when a same-file aggregator composes it', () => {
		const file: ISourceFile = {
			path: 'plugins/p/src/lib/tools/triage.tools.ts',
			text: [
				'export const buildRun = (o: O): IToolRegistration => {',
				"\treturn { id: 'run', register: async () => {} };",
				'};',
				'',
				'export const buildAll = (o: O): readonly IToolRegistration[] => [',
				'\tbuildRun(o),',
				'];',
			].join('\n'),
		};
		expect(usedWithinOwnFile(file, 'buildRun')).toBe(true);
	});

	it('does not count a mention in a comment as a use', () => {
		const file: ISourceFile = {
			path: 'plugins/p/src/lib/tools/a.tool.ts',
			text: [
				'// buildA is the builder callers should reach for.',
				'export const buildA = (o: O): IToolRegistration => {',
				"\treturn { id: 'a', register: async () => {} };",
				'};',
			].join('\n'),
		};
		expect(usedWithinOwnFile(file, 'buildA')).toBe(false);
	});
});

describe('findUnregisteredToolBuilders', () => {
	const builder = builderFile('plugins/p/src/lib/tools/a.tool.ts', 'buildA');

	it('flags a builder whose only outside reference is a test', () => {
		const result = findUnregisteredToolBuilders([
			builder,
			{
				path: 'plugins/p/tests/src/a.tool.spec.ts',
				text: 'buildA({});',
			},
			{ path: 'plugins/p/src/index.ts', text: 'export default {};' },
		]);
		expect(result.ok).toBe(false);
		expect(result.offenders).toEqual([
			{
				symbol: 'buildA',
				file: 'plugins/p/src/lib/tools/a.tool.ts',
				testReferences: ['plugins/p/tests/src/a.tool.spec.ts'],
			},
		]);
		expect(result.scannedBuilders).toBe(1);
	});

	it('flags a builder nothing outside its own file references at all', () => {
		const result = findUnregisteredToolBuilders([builder]);
		expect(result.ok).toBe(false);
		expect(result.offenders[0]?.testReferences).toEqual([]);
	});

	it('is clean once the plugin registers the builder', () => {
		const result = findUnregisteredToolBuilders([
			builder,
			{
				path: 'plugins/p/tests/src/a.tool.spec.ts',
				text: 'buildA({});',
			},
			{
				path: 'plugins/p/src/index.ts',
				text: 'tools: [buildA(options)]',
			},
		]);
		expect(result.ok).toBe(true);
		expect(result.offenders).toEqual([]);
	});

	it('honours an exclusion that states a reason', () => {
		const exclusions: readonly IUnregisteredToolExclusion[] = [
			{
				symbol: 'buildA',
				file: 'plugins/p/src/lib/tools/a.tool.ts',
				reason: 'x00533 S3 — assembled by an external host, not by the plugin.',
			},
		];
		const result = findUnregisteredToolBuilders([builder], exclusions);
		expect(result.ok).toBe(true);
		expect(result.appliedExclusions).toEqual([
			'plugins/p/src/lib/tools/a.tool.ts#buildA',
		]);
	});

	it('ignores an exclusion with no stated reason — silencing must cost an explanation', () => {
		const result = findUnregisteredToolBuilders(
			[builder],
			[
				{
					symbol: 'buildA',
					file: 'plugins/p/src/lib/tools/a.tool.ts',
					reason: '   ',
				},
			],
		);
		expect(result.ok).toBe(false);
		expect(result.appliedExclusions).toEqual([]);
	});

	it('sorts offenders by file then symbol', () => {
		const result = findUnregisteredToolBuilders([
			builderFile('plugins/z/src/lib/tools/z.tool.ts', 'buildZ'),
			builderFile('plugins/a/src/lib/tools/a.tool.ts', 'buildA'),
		]);
		expect(result.offenders.map((o) => o.symbol)).toEqual([
			'buildA',
			'buildZ',
		]);
	});
});

describe('formatReport', () => {
	it('reports clean with the number of builders it checked', () => {
		const out = formatReport({
			offenders: [],
			scannedBuilders: 12,
			appliedExclusions: [],
			ok: true,
		});
		expect(out).toContain('✓');
		expect(out).toContain('12');
	});

	it('names every offender, its file, and the test that kept it green', () => {
		const out = formatReport({
			offenders: [
				{
					symbol: 'buildA',
					file: 'plugins/p/src/lib/tools/a.tool.ts',
					testReferences: ['plugins/p/tests/src/a.tool.spec.ts'],
				},
			],
			scannedBuilders: 1,
			appliedExclusions: [],
			ok: false,
		});
		expect(out).toContain('✖');
		expect(out).toContain('plugins/p/src/lib/tools/a.tool.ts');
		expect(out).toContain('buildA');
		expect(out).toContain('plugins/p/tests/src/a.tool.spec.ts');
		expect(out).toContain('UNREGISTERED_TOOL_EXCLUSIONS');
	});
});

describe('exclusion list', () => {
	it('ships empty — nothing is silenced by default', () => {
		expect(UNREGISTERED_TOOL_EXCLUSIONS).toEqual([]);
	});

	it('would require a reason on every future entry', () => {
		for (const entry of UNREGISTERED_TOOL_EXCLUSIONS) {
			expect(entry.reason.trim().length).toBeGreaterThan(0);
		}
	});
});

describe('corpus loading', () => {
	it('reads every tracked .ts path through the injected ports', () => {
		const corpus = loadCorpus(
			'/repo',
			() => ['plugins/p/src/a.ts', 'README.md', 'plugins/p/src/b.tsx'],
			(_cwd, path) => `text of ${path}`,
		);
		expect(corpus).toEqual([
			{ path: 'plugins/p/src/a.ts', text: 'text of plugins/p/src/a.ts' },
			{
				path: 'plugins/p/src/b.tsx',
				text: 'text of plugins/p/src/b.tsx',
			},
		]);
	});

	it('passes the guarded pathspecs through', () => {
		let received: readonly string[] = [];
		loadCorpus(
			'/repo',
			(_cwd, pathspecs) => {
				received = pathspecs;
				return [];
			},
			() => '',
		);
		expect(received).toEqual([...CORPUS_PATHSPECS]);
	});
});

// x00533 S2 — the case this lint exists for. `proposals_db_status`
// was built, exported and specced while its only reference in `src`
// was its own definition. S2 registered it; this asserts, against the
// real repository, that it stays registered — the lint's own dogfood.
describe('acceptance: the x00533 S2 builder is no longer tested-only', () => {
	it('does not report buildDbStatusToolRegistration against the live repo', () => {
		const result = findUnregisteredToolBuilders(
			loadCorpus(process.cwd(), gitListTrackedFiles, readWorkspaceFile),
		);
		expect(
			result.offenders.map((offender) => offender.symbol),
		).not.toContain('buildDbStatusToolRegistration');
		expect(result.scannedBuilders).toBeGreaterThan(0);
	});
});
