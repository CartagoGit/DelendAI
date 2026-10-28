/**
 * init-config-comments.spec.ts — f00794 S3/S4.
 *
 * Two promises about the file `init` writes:
 *
 *   - it explains itself: every top-level block carries a comment that
 *     says what the block is for, taken from the schema so the two
 *     cannot drift apart;
 *   - the editor does not call it broken: `.vscode/settings.json`
 *     associates it with `jsonc`, and an existing settings file keeps
 *     every other key and every comment.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { parseJsonc } from '@delendai/core/cli';

import { InitAnswers } from './init-answers.schema';
import type { IInitAnswers } from './init-answers.types';
import { renderDelendaiConfig } from './init-render.service';
import {
	ensureJsoncAssociation,
	mergeJsoncAssociation,
} from './init-vscode-settings';
import { VSCODE_SETTINGS_RELPATH } from '../../contracts/constants/init.constant';

const roots: string[] = [];

const workspace = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'delendai-init-comments-'));
	roots.push(root);
	return root;
};

const answers = (partial: Partial<IInitAnswers> = {}): IInitAnswers =>
	InitAnswers.parse({ workspaceRoot: '/tmp/example-ws', ...partial });

afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

describe('the config init writes explains itself (f00794 S3)', () => {
	it('carries a comment above every top-level block', () => {
		const rendered = renderDelendaiConfig(
			answers({ preset: 'standard' }),
			['git'],
			{ profile: 'shared-checkout-pr' },
		);
		for (const block of [
			'$schema',
			'cacheDir',
			'docsDir',
			'plugins',
			'development',
		]) {
			const lines = rendered.content.split('\n');
			const at = lines.findIndex((line) =>
				line.trim().startsWith(`"${block}"`),
			);
			expect(at, `the ${block} block is missing`).toBeGreaterThan(0);
			const above = lines[at - 1]?.trim() ?? '';
			expect(
				above.startsWith('//'),
				`the ${block} block has no comment above it`,
			).toBe(true);
		}
	});

	it('keeps the plugin comments, inside the plugins block', () => {
		const rendered = renderDelendaiConfig(answers({ preset: 'standard' }), [
			'git',
		]);
		expect(rendered.content).toContain('// Git wrappers');
		const pluginsAt = rendered.content.indexOf('"plugins"');
		const gitAt = rendered.content.indexOf('"git"');
		expect(pluginsAt).toBeGreaterThan(-1);
		expect(gitAt).toBeGreaterThan(pluginsAt);
	});

	it('writes the same VALUES it wrote before the comments', () => {
		const rendered = renderDelendaiConfig(
			answers({ preset: 'standard', hosts: ['copilot'] }),
			['git'],
			{ profile: 'shared-checkout-pr' },
		);
		const parsed = parseJsonc(rendered.content);
		expect(parsed.errors).toEqual([]);
		const config = parsed.value as Record<string, unknown>;
		expect(config.$schema).toBe(
			'https://unpkg.com/@delendai/core/schema/delendai.config.schema.json',
		);
		expect(config.cacheDir).toBe('.cache/delendai');
		expect(config.docsDir).toBe('docs/delendai');
		expect(config.hosts).toEqual(['copilot']);
		expect(config.development).toEqual({
			profile: 'shared-checkout-pr',
		});
		expect(Object.keys(config.plugins as object)).toContain('git');
	});

	it('does not duplicate a comment when it renders twice', () => {
		const first = renderDelendaiConfig(answers({ preset: 'standard' }), [
			'git',
		]);
		const second = renderDelendaiConfig(answers({ preset: 'standard' }), [
			'git',
		]);
		expect(second.content).toBe(first.content);
		const occurrences = first.content
			.split('\n')
			.filter((line) =>
				line.includes('Where the server keeps its caches'),
			);
		expect(occurrences).toHaveLength(1);
	});
});

describe('the editor treats the config as jsonc (f00794 S4)', () => {
	it('writes the association into a settings file that does not exist', async () => {
		const root = await workspace();
		const result = await ensureJsoncAssociation(root);
		expect(result.kind).toBe('written');
		const text = await readFile(
			join(root, VSCODE_SETTINGS_RELPATH),
			'utf8',
		);
		const settings = parseJsonc(text).value as Record<string, unknown>;
		expect(
			(settings['files.associations'] as Record<string, unknown>)[
				'delendai.config.json'
			],
		).toBe('jsonc');
	});

	it('keeps every other key and every comment of an existing file', async () => {
		const root = await workspace();
		await mkdir(join(root, '.vscode'), { recursive: true });
		const original = `{
\t// Mi configuracion
\t"editor.formatOnSave": true,
\t"files.associations": {
\t\t"*.md": "markdown"
\t}
}
`;
		await writeFile(join(root, VSCODE_SETTINGS_RELPATH), original, 'utf8');
		const result = await ensureJsoncAssociation(root);
		expect(result.kind).toBe('written');
		const text = await readFile(
			join(root, VSCODE_SETTINGS_RELPATH),
			'utf8',
		);
		expect(text).toContain('// Mi configuracion');
		expect(text).toContain('"editor.formatOnSave": true');
		expect(text).toContain('"*.md": "markdown"');
		const settings = parseJsonc(text).value as Record<string, unknown>;
		expect(
			(settings['files.associations'] as Record<string, unknown>)[
				'delendai.config.json'
			],
		).toBe('jsonc');
	});

	it('changes nothing when the association is already there', () => {
		const text = `{
\t"files.associations": {
\t\t"delendai.config.json": "jsonc"
\t}
}
`;
		expect(mergeJsoncAssociation(text)).toBeUndefined();
	});

	it('leaves a file it cannot read alone', () => {
		expect(mergeJsoncAssociation('not json at all {{{')).toBeUndefined();
		expect(mergeJsoncAssociation('[1, 2, 3]')).toBeUndefined();
	});
});
