import { describe, expect, it } from 'vitest';
import { dictsByLang } from '@mcp-vertex/shared/i18n';

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
			},
			saveCommand: 'mcp-vertex.saveSettings',
			resetCommand: 'mcp-vertex.resetSettings',
			lang: dictsByLang.en,
		});
		expect(html).toContain('mcp-vertex Settings');
		expect(html).toContain('https://example.com/docs');
		expect(html).toContain('value="debug" selected');
		expect(html).toContain('value="dark" selected');
		expect(html).toContain('mcp-vertex.saveSettings');
	});

	it('f00062: client script posts booleans as booleans, not strings (H13)', async () => {
		const html = renderSettings({
			settings: {
				docsUrl: 'https://example.com/docs',
				allowLocalhost: true,
				allowPrivateIps: false,
				logLevel: 'debug',
				theme: 'dark',
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
});
