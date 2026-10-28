/**
 * init-config-comments.spec.ts — f00794 S3.
 *
 * The generated `delendai.config.json` is JSONC by contract: it carries
 * a comment above every plugin entry (f00502) and, since this slice, a
 * comment above every top-level block too.
 *
 * What is asserted here:
 *
 *   1. Every top-level block `init` writes has a comment above it, and
 *      the prose comes from the schema — the same source the published
 *      JSON Schema comes from — so the two can never disagree.
 *   2. The rendered file still parses as JSONC and its VALUE is exactly
 *      what it was: no key added, removed or changed, and the key order
 *      unchanged.
 *   3. A second `init` does not duplicate the comments. The merge path
 *      (`writeDelendaiConfig`) fills only the gaps of the file already on
 *      disk, so the comments written by the first run survive as they
 *      are.
 *   4. The per-plugin comments are still there, inside the `plugins`
 *      block.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseJsonc } from '@delendai/core/cli';
import { CONFIG_FILE_SCHEMA } from '@delendai/core/public';

import { InitAnswers } from './init-answers.schema';
import type { IInitAnswers } from './init-answers.types';
import { renderDelendaiConfig } from './init-render.service';
import { writeDelendaiConfig } from './init-writers.factory';

/** The schema URL `init` writes. */
const SCHEMA_URL =
	'https://unpkg.com/@delendai/core/schema/delendai.config.schema.json';

/**
 * A detection result the renderer accepts. Only `pluginPathsRoot` and
 * `sourceRoot` reach the config; the rest is the shape the schema
 * demands.
 */
const DETECTED = {
	language: 'typescript',
	packageManager: 'bun',
	hasMcpProject: false,
	mcpEvidence: [] as string[],
	pluginPathsRoot: 'packages',
	sourceRoot: 'src' as const,
	hostEntrySource: 'unresolved' as const,
};

/**
 * The blocks `init` writes when the project has them all.
 *
 * A function rather than a module-level constant: the list is read
 * inside a test that has already rendered the config, and a plain
 * module-level binding is not reliably in scope at that point.
 */
const configBlocks = (): readonly string[] => [
	'cacheDir',
	'docsDir',
	'hosts',
	'plugins',
	'development',
	'convention',
];

const parseAnswers = (partial: Partial<IInitAnswers> = {}): IInitAnswers =>
	InitAnswers.parse({
		workspaceRoot: '/tmp/example-ws',
		preset: 'swarm',
		...partial,
	});

/** The project with every block: hosts, a development block, a layout. */
const fullAnswers = (): IInitAnswers =>
	parseAnswers({ hosts: ['copilot', 'claude'], detected: DETECTED });

const renderConfig = (
	answers: IInitAnswers = fullAnswers(),
	plugins: readonly string[] = ['git', 'proposals'],
	development: Record<string, unknown> | null = {
		profile: 'shared-checkout-pr',
	},
): string =>
	renderDelendaiConfig(
		answers,
		plugins,
		development === null ? undefined : development,
	).content;

/**
 * The comment written above the top-level member `key`, or `undefined`
 * when the member has none.
 *
 * The comment is a wrapped block, so every `//` row above the member
 * belongs to it; they are joined back into one paragraph.
 */
const commentAbove = (content: string, key: string): string | undefined => {
	const lines = content.split('\n');
	const index = lines.findIndex((line) =>
		line.trim().startsWith(`"${key}":`),
	);
	if (index <= 0) return undefined;
	const rows: string[] = [];
	for (let cursor = index - 1; cursor >= 0; cursor--) {
		const row = lines[cursor]?.trim() ?? '';
		if (!row.startsWith('//')) break;
		rows.unshift(row.slice(2).trim());
	}
	return rows.length === 0 ? undefined : rows.join(' ');
};

/**
 * The comment row written immediately above each top-level block.
 *
 * The plugin comments are NOT part of this: they come from the plugin
 * manifests and were written before this slice, so they are neither
 * wrapped nor owned here.
 */
const blockCommentRows = (
	content: string,
): readonly { readonly block: string; readonly text: string }[] => {
	const rows: { block: string; text: string }[] = [];
	const lines = content.split('\n');
	for (const block of configBlocks()) {
		const index = lines.findIndex((line) =>
			line.trim().startsWith(`"${block}":`),
		);
		if (index <= 0) continue;
		const text = lines[index - 1]?.trim() ?? '';
		if (!text.startsWith('//')) continue;
		rows.push({ block, text: text.slice(2).trim() });
	}
	return rows;
};

describe('init config block comments (f00794 S3)', () => {
	it('writes a comment above every top-level block', () => {
		const content = renderConfig();
		for (const block of configBlocks()) {
			expect(commentAbove(content, block), block).toBeDefined();
		}
	});

	it('takes the prose from the schema, not from a second copy of it', () => {
		const content = renderConfig();
		// The schema's own words for `cacheDir`.
		expect(commentAbove(content, 'cacheDir')).toContain(
			'Where the server keeps its caches',
		);
		expect(commentAbove(content, 'docsDir')).toContain(
			'Where the server writes the documents a person reads and edits',
		);
		// The one override: the `plugins` block says what it does FOR
		// the person reading the file.
		expect(commentAbove(content, 'plugins')).toBe(
			'The plugins this project can turn on.',
		);
	});

	it('wraps every block comment row to a readable width', () => {
		const content = renderConfig();
		const rows = blockCommentRows(content);
		expect(rows.length).toBe(configBlocks().length);
		for (const row of rows) {
			expect(row.text.length, row.block).toBeLessThanOrEqual(72);
		}
	});

	it('keeps the value exactly as it was — no key added, removed or changed', () => {
		const content = renderConfig();
		const { value, errors } = parseJsonc(content);
		expect(errors).toEqual([]);
		const parsed = value as Record<string, unknown>;
		// The key order is part of the contract: the file reads
		// `$schema, cacheDir, docsDir, hosts?, plugins, development?,
		// convention?`.
		expect(Object.keys(parsed)).toEqual([
			'$schema',
			'cacheDir',
			'docsDir',
			'hosts',
			'plugins',
			'development',
			'convention',
		]);
		expect(parsed).toEqual({
			$schema: SCHEMA_URL,
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			hosts: ['copilot', 'claude'],
			plugins: expect.any(Object),
			development: { profile: 'shared-checkout-pr' },
			convention: { pluginPathsRoot: 'packages', sourceRoot: 'src' },
		});
		// The value is still a valid config.
		expect(CONFIG_FILE_SCHEMA.safeParse(parsed).success).toBe(true);
		const plugins = parsed.plugins as Record<
			string,
			{ readonly enabled?: boolean; readonly options?: unknown }
		>;
		expect(Object.keys(plugins)).toEqual(
			expect.arrayContaining(['git', 'proposals']),
		);
		expect(plugins.git?.enabled).toBeUndefined();
		expect(plugins.git?.options).toEqual(expect.any(Object));
	});

	it('omits the blocks the project does not have', () => {
		const content = renderConfig(
			parseAnswers({ preset: 'swarm' }),
			['git'],
			null,
		);
		const { value } = parseJsonc(content);
		const parsed = value as Record<string, unknown>;
		expect(Object.keys(parsed)).toEqual([
			'$schema',
			'cacheDir',
			'docsDir',
			'plugins',
		]);
		expect(commentAbove(content, 'hosts')).toBeUndefined();
		expect(commentAbove(content, 'development')).toBeUndefined();
		expect(commentAbove(content, 'convention')).toBeUndefined();
	});

	it('keeps the per-plugin comments, inside the plugins block', () => {
		const content = renderConfig();
		const lines = content.split('\n');
		const pluginsIndex = lines.findIndex((line) =>
			line.trim().startsWith('"plugins":'),
		);
		expect(pluginsIndex).toBeGreaterThan(0);
		const pluginsIndent =
			/^[ \t]*/u.exec(lines[pluginsIndex] ?? '')?.[0] ?? '';
		const gitIndex = lines.findIndex((line) =>
			line.trim().startsWith('"git":'),
		);
		expect(gitIndex).toBeGreaterThan(pluginsIndex);
		const comment = lines[gitIndex - 1]?.trim() ?? '';
		expect(comment.startsWith('//')).toBe(true);
		// The comment sits INSIDE the `plugins` block: it is indented
		// deeper than the block itself.
		const commentIndent =
			/^[ \t]*/u.exec(lines[gitIndex - 1] ?? '')?.[0] ?? '';
		expect(commentIndent.length).toBeGreaterThan(pluginsIndent.length);
		expect(comment).toContain(
			'Options: docs/delendai/plugins/auto-generated/git.md',
		);
	});

	it('does not duplicate a comment when init runs twice', async () => {
		const workspace = await mkdtemp(join(tmpdir(), 'delendai-config-cmt-'));
		try {
			const content = renderConfig();
			const value = parseJsonc(content).value as Record<string, unknown>;
			const first = await writeDelendaiConfig(
				workspace,
				value,
				false,
				content,
			);
			expect(first.kind).toBe('written');
			const onDisk = await readFile(
				`${workspace}/delendai.config.json`,
				'utf8',
			);
			expect(onDisk).toBe(content);

			// The second `init` takes the merge path: the file already
			// says everything the generated one would, so it is not
			// rewritten at all — and the comments stay singular.
			const second = await writeDelendaiConfig(
				workspace,
				value,
				false,
				content,
			);
			expect(second.kind).toBe('merged');
			const after = await readFile(
				`${workspace}/delendai.config.json`,
				'utf8',
			);
			expect(after).toBe(onDisk);
			// Every block comment appears exactly once.
			for (const row of blockCommentRows(content)) {
				const occurrences = after.split(`// ${row.text}`).length - 1;
				expect(occurrences, row.block).toBe(1);
			}
		} finally {
			await rm(workspace, { recursive: true, force: true });
		}
	});
});
