import { describe, expect, it } from 'vitest';
import { dictsByLang } from '@delendai/shared/i18n';

import { renderSettings } from '../../src/settings/render-settings';

describe('renderSettings', async () => {
	it('renders settings values and command ids', async () => {
		const html = renderSettings({
			settings: {
				docsUrl: 'https://example.com/docs',
				allowLocalhost: true,
				allowPrivateIps: false,
				logLevel: 'debug',
				theme: 'dark',
				language: 'en',
				motion: 'system',
			},
			saveCommand: 'mcp-vertex.saveSettings',
			resetCommand: 'mcp-vertex.resetSettings',
			lang: dictsByLang.en,
		});
		expect(html).toContain('mcp-vertex Settings');
		expect(html).toContain('https://example.com/docs');
		expect(html).toContain('value="debug" selected');
		expect(html).toContain('value="dark" selected');
		expect(html).toContain('value="midnight"');
		expect(html).toContain('value="es"');
		expect(html).toContain('name="motion"');
		expect(html).toContain('mcp-vertex.saveSettings');
		expect(html).toContain('aria-live="polite"');
		expect(html).toContain('aria-describedby="mcpv-docs-url-description"');
		expect(html).toContain('@media (prefers-reduced-motion: reduce)');
	});

	it('f00062: client script posts booleans as booleans, not strings (H13)', async () => {
		const html = renderSettings({
			settings: {
				docsUrl: 'https://example.com/docs',
				allowLocalhost: true,
				allowPrivateIps: false,
				logLevel: 'debug',
				theme: 'dark',
				language: 'en',
				motion: 'system',
			},
			saveCommand: 'mcp-vertex.saveSettings',
			resetCommand: 'mcp-vertex.resetSettings',
			lang: dictsByLang.en,
		});
		// The renderer must NOT stringify booleans to 'true' / 'false' anymore —
		// the host's Zod parse rejects strings where booleans are declared.
		expect(html).not.toMatch(/\.checked\s*\?\s*'true'\s*:\s*'false'/);
		// The renderer reads the checkbox state directly into the value.
		expect(html).toMatch(
			/out\.allowLocalhost\s*=\s*form\.querySelector\([^)]*allowLocalhost[^)]*\)\.checked\s*;/,
		);
		expect(html).toMatch(
			/out\.allowPrivateIps\s*=\s*form\.querySelector\([^)]*allowPrivateIps[^)]*\)\.checked\s*;/,
		);
	});

	it('announces success only after a matching host acknowledgement', () => {
		const html = renderSettings({
			settings: {
				docsUrl: 'https://example.com/docs',
				allowLocalhost: false,
				allowPrivateIps: false,
				logLevel: 'info',
				theme: 'nord',
				language: 'es',
				motion: 'reduced',
			},
			saveCommand: 'mcp-vertex.saveSettings',
			resetCommand: 'mcp-vertex.resetSettings',
			lang: dictsByLang.es,
		});
		expect(html).toContain('<html lang="es" dir="ltr">');
		expect(html).toContain('Guardando los ajustes…');
		expect(html).toContain("message.command === 'settingsSaved'");
		expect(html).toContain("message.command === 'settingsError'");
		expect(html).toContain('message.requestId !== pending.requestId');
		expect(html).toContain('button.disabled = true');
		expect(html).not.toMatch(
			/postMessage\(\{ command: 'save'[\s\S]{0,160}announce\("Guardado\./,
		);
	});

	it('resolves complete settings copy for every supported language', () => {
		for (const [language, dict] of Object.entries(dictsByLang)) {
			const html = renderSettings({
				settings: {
					docsUrl: 'https://example.com',
					allowLocalhost: false,
					allowPrivateIps: false,
					logLevel: 'info',
					theme: 'system',
					language: language as keyof typeof dictsByLang,
					motion: 'system',
				},
				saveCommand: 'save',
				resetCommand: 'reset',
				lang: dict,
			});
			expect(html).not.toContain('settings.');
			expect(html).toContain(`lang="${language}"`);
		}
	});
});
