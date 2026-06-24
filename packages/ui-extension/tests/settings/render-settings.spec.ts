import { describe, expect, it } from 'vitest';

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
		});
		expect(html).toContain('mcp-vertex Settings');
		expect(html).toContain('https://example.com/docs');
		expect(html).toContain('value="debug" selected');
		expect(html).toContain('value="dark" selected');
		expect(html).toContain('mcp-vertex.saveSettings');
	});
});
