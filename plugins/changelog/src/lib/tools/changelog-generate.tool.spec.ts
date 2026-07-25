import { describe, expect, it } from 'vitest';

import {
	groupByType,
	parseConventionalCommit,
	renderMarkdown,
	type CommitType,
	type IConventionalCommit,
} from '../render';
import {
	buildChangelogGenerateToolRegistration,
	parseGitLogOutput,
	resolveRequestedRange,
} from './changelog-generate.tool';

const commit = (
	overrides: Partial<IConventionalCommit> &
		Pick<IConventionalCommit, 'hash' | 'subject'>,
): IConventionalCommit => ({
	type: 'other',
	breaking: false,
	...overrides,
});

describe('parseConventionalCommit', () => {
	it('parses the supported conventional commit types plus plain fallback', () => {
		const cases: ReadonlyArray<{
			line: string;
			type: CommitType;
			scope?: string;
			subject: string;
		}> = [
			{
				line: 'abc1234 feat(ui): add button',
				type: 'feat',
				scope: 'ui',
				subject: 'add button',
			},
			{
				line: 'abc1234 fix(api): handle null',
				type: 'fix',
				scope: 'api',
				subject: 'handle null',
			},
			{
				line: 'abc1234 docs(readme): update intro',
				type: 'docs',
				scope: 'readme',
				subject: 'update intro',
			},
			{
				line: 'abc1234 refactor(core): split helper',
				type: 'refactor',
				scope: 'core',
				subject: 'split helper',
			},
			{
				line: 'abc1234 perf(cache): avoid extra copy',
				type: 'perf',
				scope: 'cache',
				subject: 'avoid extra copy',
			},
			{
				line: 'abc1234 test(cli): add smoke case',
				type: 'test',
				scope: 'cli',
				subject: 'add smoke case',
			},
			{
				line: 'abc1234 build(ci): pin bun',
				type: 'build',
				scope: 'ci',
				subject: 'pin bun',
			},
			{
				line: 'abc1234 ci(actions): tweak matrix',
				type: 'ci',
				scope: 'actions',
				subject: 'tweak matrix',
			},
			{
				line: 'abc1234 chore(repo): prune temp file',
				type: 'chore',
				scope: 'repo',
				subject: 'prune temp file',
			},
			{
				line: 'abc1234 style(site): reflow headings',
				type: 'style',
				scope: 'site',
				subject: 'reflow headings',
			},
			{
				line: 'abc1234 revert: undo broken release note',
				type: 'revert',
				subject: 'undo broken release note',
			},
			{
				line: 'abc1234 plain subject without conventional prefix',
				type: 'other',
				subject: 'plain subject without conventional prefix',
			},
		];

		for (const testCase of cases) {
			const parsed = parseConventionalCommit(testCase.line);
			expect(parsed).not.toBeNull();
			expect(parsed?.type).toBe(testCase.type);
			expect(parsed?.scope).toBe(testCase.scope);
			expect(parsed?.subject).toBe(testCase.subject);
			expect(parsed?.hash).toBe('abc1234');
			expect(parsed?.breaking).toBe(false);
		}
	});

	it('marks bang syntax as breaking and extracts the body', () => {
		const parsed = parseConventionalCommit(
			'abc1234 feat(core)!: drop legacy mode\n\nContext body',
		);
		expect(parsed).toEqual({
			type: 'feat',
			scope: 'core',
			subject: 'drop legacy mode',
			body: 'Context body',
			breaking: true,
			hash: 'abc1234',
		});
	});

	it('marks BREAKING CHANGE footer as breaking', () => {
		const parsed = parseConventionalCommit(
			'abc1234 fix: rename flag\n\nBREAKING CHANGE: the old flag is removed',
		);
		expect(parsed?.type).toBe('fix');
		expect(parsed?.breaking).toBe(true);
		expect(parsed?.body).toContain('BREAKING CHANGE:');
	});

	it('returns null when the line has no hash prefix', () => {
		expect(parseConventionalCommit('feat(ui): add button')).toBeNull();
	});
});

describe('groupByType', () => {
	it('returns an empty list for empty input', () => {
		expect(groupByType([])).toEqual([]);
	});

	it('groups a single commit', () => {
		expect(
			groupByType([
				commit({ hash: 'a1', subject: 'ship', type: 'feat' }),
			]),
		).toEqual([
			{
				type: 'feat',
				commits: [
					commit({ hash: 'a1', subject: 'ship', type: 'feat' }),
				],
			},
		]);
	});

	it('keeps stable section order and moves breaking commits to their own section', () => {
		const grouped = groupByType([
			commit({ hash: 'c1', subject: 'misc', type: 'other' }),
			commit({ hash: 'c2', subject: 'speed up', type: 'perf' }),
			commit({ hash: 'c3', subject: 'new endpoint', type: 'feat' }),
			commit({
				hash: 'c4',
				subject: 'drop v1',
				type: 'feat',
				breaking: true,
			}),
			commit({ hash: 'c5', subject: 'fix race', type: 'fix' }),
		]);
		expect(grouped.map((section) => section.type)).toEqual([
			'breaking',
			'feat',
			'fix',
			'perf',
			'other',
		]);
		expect(grouped[0]?.commits[0]?.subject).toBe('drop v1');
	});
});

describe('renderMarkdown', () => {
	it('renders empty sections as an empty string', () => {
		expect(renderMarkdown([])).toBe('');
	});

	it('renders a single section with scope formatting', () => {
		expect(
			renderMarkdown([
				{
					type: 'feat',
					commits: [
						commit({
							hash: 'abc1234',
							subject: 'add dashboard',
							type: 'feat',
							scope: 'ui',
						}),
					],
				},
			]),
		).toBe('## Features\n- **ui**: add dashboard (abc1234)');
	});

	it('renders multiple sections with breaking changes separated', () => {
		expect(
			renderMarkdown([
				{
					type: 'breaking',
					commits: [
						commit({
							hash: 'b1',
							subject: 'remove old api',
							type: 'feat',
							breaking: true,
							scope: 'api',
						}),
					],
				},
				{
					type: 'fix',
					commits: [
						commit({
							hash: 'f1',
							subject: 'handle null',
							type: 'fix',
						}),
					],
				},
			]),
		).toBe(
			'## BREAKING CHANGES\n- **api**: remove old api (b1)\n\n## Bug Fixes\n- handle null (f1)',
		);
	});
});

describe('changelog_generate tool', () => {
	it('parses git log output entries separated by record delimiters', () => {
		expect(
			parseGitLogOutput(
				'abc1234 feat(ui): add button\u001e\ndef5678 fix: handle null\n\nBREAKING CHANGE: removed fallback\u001e',
			),
		).toEqual([
			{
				type: 'feat',
				scope: 'ui',
				subject: 'add button',
				breaking: false,
				hash: 'abc1234',
			},
			{
				type: 'fix',
				subject: 'handle null',
				body: 'BREAKING CHANGE: removed fallback',
				breaking: true,
				hash: 'def5678',
			},
		]);
	});

	it('parses range from from/to tokens', () => {
		expect(
			resolveRequestedRange({ range: '', from: 'v0.5.0', to: 'HEAD' }),
		).toBe('v0.5.0..HEAD');
		expect(resolveRequestedRange({ range: '  HEAD~5..HEAD  ' })).toBe(
			'HEAD~5..HEAD',
		);
	});

	it('returns markdown, sections and commit count on the happy path', async () => {
		let registered:
			| ((args: {
					range: string;
					from?: string;
					to?: string;
			  }) => Promise<unknown>)
			| undefined;
		const calls: string[][] = [];
		const registration = buildChangelogGenerateToolRegistration({
			namespacePrefix: 'test',
			workspaceRootAbs: '/tmp/repo',
			gitRunner: async (args) => {
				calls.push([...args]);
				return {
					ok: true,
					output: 'abc1234 feat(ui): add dashboard\u001edef5678 fix: handle null\u001e',
				};
			},
		});
		await registration.register({
			registerTool: (
				_name: string,
				_meta: unknown,
				handler: typeof registered,
			) => {
				registered = handler;
			},
		} as never);
		const result = (await registered?.({
			range: '',
			from: 'v0.5.0',
			to: 'HEAD',
		})) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text ?? '{}');
		expect(calls).toEqual([
			['log', 'v0.5.0..HEAD', '--pretty=format:%h %s%n%b%x1e'],
		]);
		expect(payload).toEqual({
			ok: true,
			markdown:
				'## Features\n- **ui**: add dashboard (abc1234)\n\n## Bug Fixes\n- handle null (def5678)',
			sections: [
				{
					type: 'feat',
					commits: [
						{
							type: 'feat',
							scope: 'ui',
							subject: 'add dashboard',
							breaking: false,
							hash: 'abc1234',
						},
					],
				},
				{
					type: 'fix',
					commits: [
						{
							type: 'fix',
							subject: 'handle null',
							breaking: false,
							hash: 'def5678',
						},
					],
				},
			],
			commitCount: 2,
		});
	});

	it('returns the typed empty-range envelope without calling git', async () => {
		let registered:
			| ((args: {
					range: string;
					from?: string;
					to?: string;
			  }) => Promise<unknown>)
			| undefined;
		let gitCalls = 0;
		const registration = buildChangelogGenerateToolRegistration({
			namespacePrefix: 'test',
			workspaceRootAbs: '/tmp/repo',
			gitRunner: async () => {
				gitCalls += 1;
				return { ok: true, output: '' };
			},
		});
		await registration.register({
			registerTool: (
				_name: string,
				_meta: unknown,
				handler: typeof registered,
			) => {
				registered = handler;
			},
		} as never);
		const result = (await registered?.({ range: '   ' })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text ?? '{}');
		expect(gitCalls).toBe(0);
		expect(payload).toEqual({
			ok: false,
			error: {
				reason: 'empty-range',
				nextAction:
					'Provide a non-empty git range, or pass `from` and `to`.',
			},
		});
	});

	it('uses the injected gitRunner and reports empty matched ranges', async () => {
		let registered:
			| ((args: {
					range: string;
					from?: string;
					to?: string;
			  }) => Promise<unknown>)
			| undefined;
		let gitCalls = 0;
		const registration = buildChangelogGenerateToolRegistration({
			namespacePrefix: 'test',
			workspaceRootAbs: '/tmp/repo',
			gitRunner: async () => {
				gitCalls += 1;
				return { ok: true, output: '' };
			},
		});
		await registration.register({
			registerTool: (
				_name: string,
				_meta: unknown,
				handler: typeof registered,
			) => {
				registered = handler;
			},
		} as never);
		const result = (await registered?.({ range: 'v1.0.0..HEAD' })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text ?? '{}');
		expect(gitCalls).toBe(1);
		expect(payload).toEqual({
			ok: false,
			error: {
				reason: 'empty-range',
				nextAction:
					'No commits matched that range. Adjust `range`, `from`, or `to`.',
			},
		});
	});
});
