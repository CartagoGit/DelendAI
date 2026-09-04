import { describe, expect, it } from 'vitest';

import {
	conventionalPluginDocsPath,
	renderPluginConfigComment,
	resolvePluginConfigDocs,
} from '@delendai/core/lib/plugins/plugin-config-docs';

const browser = {
	id: 'browser',
	summary: 'Headless browser automation tools.',
} as const;

describe('plugin-config-docs (f00502 S3)', async () => {
	describe('resolvePluginConfigDocs', async () => {
		it('derives the comment from the manifest a plugin already declares', async () => {
			expect(resolvePluginConfigDocs(browser)).toEqual({
				summary: 'Headless browser automation tools.',
				docs: 'docs/delendai/plugins/auto-generated/browser.md',
			});
		});

		it('lets a plugin override only the wording', async () => {
			const resolved = resolvePluginConfigDocs({
				...browser,
				configDocs: { summary: 'Automates the browser.' },
			});

			expect(resolved.summary).toBe('Automates the browser.');
			expect(resolved.docs).toBe(conventionalPluginDocsPath('browser'));
		});

		it('lets a plugin override only the page', async () => {
			const resolved = resolvePluginConfigDocs({
				...browser,
				configDocs: { docs: 'https://delendai.dev/browser' },
			});

			expect(resolved.summary).toBe(browser.summary);
			expect(resolved.docs).toBe('https://delendai.dev/browser');
		});
	});

	describe('renderPluginConfigComment', async () => {
		it('an enabled plugin gets its summary and its options pointer', async () => {
			expect(
				renderPluginConfigComment(browser, { enabled: true }),
			).toEqual([
				'Headless browser automation tools.',
				'Options: docs/delendai/plugins/auto-generated/browser.md',
			]);
		});

		it('a disabled plugin explains its own absence, naming the preset', async () => {
			const lines = renderPluginConfigComment(browser, {
				enabled: false,
				presetName: 'minimal',
			});

			expect(lines[1]).toBe(
				'Available, but not enabled by the minimal preset.',
			);
		});

		it('says it plainly when there is no preset to name', async () => {
			const lines = renderPluginConfigComment(browser, {
				enabled: false,
			});

			expect(lines[1]).toBe('Available, but not enabled.');
		});
	});
});
