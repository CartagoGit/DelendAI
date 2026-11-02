import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	ContextForChangeOutputSchema,
	runContextForChange,
} from '../../src/public/index';

/**
 * The context's reach follows what it was given: nothing a caller named
 * is dropped, and what a search finds beyond its cap is named.
 */
const createdRoots: string[] = [];

const makeWorkspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'context-for-change-reach-'));
	createdRoots.push(root);
	await mkdir(join(root, 'src/lib'), { recursive: true });
	await mkdir(join(root, 'docs'), { recursive: true });
	await writeFile(
		join(root, 'src/lib/foo.ts'),
		'export function foo(value: string): string {\n\treturn value;\n}\n',
		'utf8',
	);
	return root;
};

afterEach(async () => {
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('context_for_change reach', () => {
	it('keeps every file the caller names, and says where a cut leaves off', async () => {
		const root = await makeWorkspace();
		const named = Array.from(
			{ length: 12 },
			(_, index) => `src/lib/f${String(index)}.ts`,
		);
		for (const file of named) {
			await writeFile(
				join(root, file),
				`export const v = ${String(file.length)};\n`,
				'utf8',
			);
		}
		const result = await runContextForChange(
			{ files: named, task: 'a slice of many files' },
			{
				namespacePrefix: 'delendai',
				workspaceRootAbs: root,
				maxBytes: 64_000,
				docsRoots: ['docs'],
			},
		);
		const output = ContextForChangeOutputSchema.parse(
			result.structuredContent,
		);
		expect(output.files).toEqual(named);

		const small = ContextForChangeOutputSchema.parse(
			(
				await runContextForChange(
					{ files: ['src/lib/foo.ts'], task: 'trim output' },
					{
						namespacePrefix: 'delendai',
						workspaceRootAbs: root,
						maxBytes: 220,
						docsRoots: ['docs'],
					},
				)
			).structuredContent,
		);
		expect(small.sections[0]?.summary).toContain('within 220 bytes');
	});

	it('names the files and symbols a search found beyond its reach', async () => {
		const root = await makeWorkspace();
		for (let index = 0; index < 11; index += 1) {
			await writeFile(
				join(root, `src/lib/uses${String(index)}.ts`),
				`export const widgetUser${String(index)} = 'widget';\n`,
				'utf8',
			);
		}
		await writeFile(
			join(root, 'src/lib/many.ts'),
			Array.from(
				{ length: 9 },
				(_, index) =>
					`export const many${String(index)} = ${String(index)};`,
			).join('\n'),
			'utf8',
		);
		const bySymbol = ContextForChangeOutputSchema.parse(
			(
				await runContextForChange(
					{ symbol: 'widget', task: 'find widget' },
					{
						namespacePrefix: 'delendai',
						workspaceRootAbs: root,
						maxBytes: 64_000,
						docsRoots: ['docs'],
					},
				)
			).structuredContent,
		);
		const symbols = bySymbol.sections.find(
			(section) => section.source === 'symbols',
		);
		expect(symbols?.summary).toMatch(
			/more file\(s\) name `widget`|…\+\d+/u,
		);

		const byFile = ContextForChangeOutputSchema.parse(
			(
				await runContextForChange(
					{ files: ['src/lib/many.ts'], task: 'many symbols' },
					{
						namespacePrefix: 'delendai',
						workspaceRootAbs: root,
						maxBytes: 64_000,
						docsRoots: ['docs'],
					},
				)
			).structuredContent,
		);
		expect(
			byFile.sections.find((section) => section.source === 'symbols')
				?.summary,
		).toContain('more symbol(s) of these files');
	});
});
