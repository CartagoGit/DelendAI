import {
	applyJsoncEdits,
	mergeDerivedConfig,
	parseJsonc,
} from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import { planConfigMergeEdits } from './config-merge-edits';

type IRecord = Record<string, unknown>;

/** Apply the plan to a config's own text and read the result back. */
const mergeThroughText = (
	recommended: IRecord,
	existingText: string,
	comments?: ReadonlyMap<string, readonly string[]>,
): { readonly text: string; readonly value: unknown } => {
	const existing = parseJsonc(existingText).value as IRecord;
	const text = applyJsoncEdits(
		existingText,
		planConfigMergeEdits(recommended, existing, comments),
	);
	return { text, value: parseJsonc(text).value };
};

describe('config merge as JSONC edits (f00502 S4)', () => {
	describe('it agrees with the object merge it replaces', () => {
		// The strongest statement available: whatever the value-level merge
		// would have produced, the text-level merge produces too. If these
		// ever diverge, one of them is wrong and this test says so.
		const cases: readonly {
			readonly name: string;
			readonly recommended: IRecord;
			readonly existing: IRecord;
		}[] = [
			{
				name: 'a plugin the catalogue gained',
				recommended: {
					plugins: {
						git: { enabled: true },
						search: { enabled: false },
					},
				},
				existing: { plugins: { git: { enabled: false } } },
			},
			{
				name: 'options merged one level deeper',
				recommended: {
					plugins: {
						git: {
							enabled: true,
							options: { depth: 1, mode: 'a' },
						},
					},
				},
				existing: {
					plugins: { git: { options: { mode: 'user-choice' } } },
				},
			},
			{
				name: 'a top-level key the user never had',
				recommended: { version: 2, docsDir: 'docs' },
				existing: { docsDir: 'documentation' },
			},
			{
				name: 'a config with no plugins block at all',
				recommended: { plugins: { git: { enabled: true } } },
				existing: { docsDir: 'docs' },
			},
			{
				name: 'a plugin entry the user made a non-object',
				recommended: { plugins: { git: { enabled: true } } },
				existing: { plugins: { git: false } },
			},
			{
				name: 'nothing missing at all',
				recommended: { plugins: { git: { enabled: true } } },
				existing: { plugins: { git: { enabled: false } } },
			},
		];

		for (const testCase of cases) {
			it(testCase.name, () => {
				const { value } = mergeThroughText(
					testCase.recommended,
					JSON.stringify(testCase.existing, null, '\t'),
				);

				expect(value).toEqual(
					mergeDerivedConfig(testCase.recommended, testCase.existing),
				);
			});
		}
	});

	describe('it keeps what the user wrote around the values', () => {
		const userConfig = [
			'{',
			'\t// We keep docs out of the default folder on purpose.',
			'\t"docsDir": "documentation",',
			'\t"plugins": {',
			'\t\t// Off until the security review lands. Do not re-enable.',
			'\t\t"git": { "enabled": false }',
			'\t}',
			'}',
			'',
		].join('\n');

		it('preserves comments through a merge that adds a plugin', () => {
			const { text } = mergeThroughText(
				{
					plugins: {
						git: { enabled: true },
						search: { enabled: true },
					},
				},
				userConfig,
			);

			expect(text).toContain(
				'// Off until the security review lands. Do not re-enable.',
			);
			expect(text).toContain(
				'// We keep docs out of the default folder on purpose.',
			);
			expect(text).toContain('"search"');
		});

		it('never overrides the preference the comment explains', () => {
			const { value } = mergeThroughText(
				{ plugins: { git: { enabled: true } } },
				userConfig,
			);

			expect(((value as IRecord).plugins as IRecord).git).toMatchObject({
				enabled: false,
			});
		});

		it('leaves the file alone when there is no gap to fill', () => {
			expect(
				planConfigMergeEdits(
					{ plugins: { git: { enabled: true } } },
					parseJsonc(userConfig).value as IRecord,
				),
			).toEqual([]);
		});

		it('is idempotent: a second merge plans nothing and adds no second comment', () => {
			const comments = new Map<string, readonly string[]>([
				['plugins.search', ['Full-text search over the workspace.']],
			]);
			const first = mergeThroughText(
				{
					plugins: {
						git: { enabled: true },
						search: { enabled: true },
					},
				},
				userConfig,
				comments,
			);
			const second = mergeThroughText(
				{
					plugins: {
						git: { enabled: true },
						search: { enabled: true },
					},
				},
				first.text,
				comments,
			);

			expect(second.text).toBe(first.text);
			expect(
				first.text.split('Full-text search over the workspace.')
					.length - 1,
			).toBe(1);
		});

		it('comments a member it creates, and only that one', () => {
			const { text } = mergeThroughText(
				{
					plugins: {
						git: { enabled: true },
						search: { enabled: true },
					},
				},
				userConfig,
				new Map<string, readonly string[]>([
					[
						'plugins.git',
						['This must NOT appear: git already exists.'],
					],
					['plugins.search', ['Added by init.']],
				]),
			);

			expect(text).toContain('// Added by init.');
			expect(text).not.toContain('This must NOT appear');
		});
	});
});
