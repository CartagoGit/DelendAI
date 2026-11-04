import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_TOKENS,
	HOST_TOKEN_MIGRATION_MAP,
	renderComponentCssTokenRootCss,
} from '../../src/styles/component-css';

const here = dirname(fileURLToPath(import.meta.url));

const readSource = async (relativePath: string): Promise<string> =>
	readFile(resolve(here, relativePath), 'utf8');

describe('componentCss token contract', async () => {
	it('matches the expected host migration snapshot', async () => {
		expect(
			JSON.stringify(
				{
					tokenKeys: Object.keys(DEFAULT_TOKENS).sort(),
					migrationMap: HOST_TOKEN_MIGRATION_MAP,
					rootCss: renderComponentCssTokenRootCss(),
				},
				null,
				2,
			),
		).toMatchInlineSnapshot(`
				"{
				  "tokenKeys": [
				    "--delendai-bg-primary",
				    "--delendai-fg-primary"
				  ],
				  "migrationMap": {
				    "--vscode-editor-background": "--delendai-bg-primary",
				    "--vscode-editor-foreground": "--delendai-fg-primary"
				  },
				  "rootCss": ":root {\\n\\t--delendai-bg-primary: var(--vscode-editor-background, #0d1117);\\n\\t--delendai-fg-primary: var(--vscode-editor-foreground, #c9d1d9);\\n}"
				}"
			`);
	});

	it('keeps direct vscode editor tokens out of the migrated webviews', async () => {
		const [settingsSource, knowledgeSource] = await Promise.all([
			readSource('../../src/settings/render-settings.ts'),
			readSource('../../src/knowledge/render-knowledge-navigator.ts'),
		]);

		expect(
			JSON.stringify(
				{
					settingsUsesComponentTokens:
						settingsSource.includes('var(--delendai-bg-primary)') &&
						settingsSource.includes('var(--delendai-fg-primary)'),
					settingsHasDirectVscodeEditorTokens:
						settingsSource.includes(
							'var(--vscode-editor-background',
						) ||
						settingsSource.includes(
							'var(--vscode-editor-foreground',
						),
					knowledgeUsesComponentTokens:
						knowledgeSource.includes(
							'var(--delendai-bg-primary)',
						) &&
						knowledgeSource.includes('var(--delendai-fg-primary)'),
					knowledgeHasDirectVscodeEditorTokens:
						knowledgeSource.includes(
							'var(--vscode-editor-background',
						) ||
						knowledgeSource.includes(
							'var(--vscode-editor-foreground',
						),
				},
				null,
				2,
			),
		).toMatchInlineSnapshot(`
				"{
				  "settingsUsesComponentTokens": true,
				  "settingsHasDirectVscodeEditorTokens": false,
				  "knowledgeUsesComponentTokens": true,
				  "knowledgeHasDirectVscodeEditorTokens": false
				}"
			`);
	});
});
