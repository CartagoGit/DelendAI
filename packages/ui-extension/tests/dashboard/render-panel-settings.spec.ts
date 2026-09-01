import { describe, expect, it } from 'vitest';

import type { IExtensionSettings } from '@mcp-vertex/client';
import { dictsByLang } from '@mcp-vertex/shared/i18n';

import { renderPanelSettings } from '../../src/dashboard/render-panel-settings';

const baseSettings: IExtensionSettings = {
	docsUrl: 'https://mcp-vertex.dev',
	allowLocalhost: false,
	allowPrivateIps: false,
	logLevel: 'info',
	theme: 'system',
	language: 'en',
	motion: 'system',
};

describe('renderPanelSettings', () => {
	it('renders the panel with the appearance, workspace and diagnostics sections', () => {
		const html = renderPanelSettings(baseSettings, dictsByLang.en);
		expect(html).toContain('panel-settings');
		expect(html).toContain('settings-section-appearance');
		expect(html).toContain('settings-section-workspace');
		expect(html).toContain('settings-section-diagnostics');
		expect(html).toContain('settings-section-preview');
		expect(html).toContain('mcpv-settings__theme-grid');
		expect(html).toContain('mcpv-settings__lang-grid');
	});

	it('renders the compact-mode toggle', () => {
		const html = renderPanelSettings(baseSettings, dictsByLang.en);
		expect(html).toContain('data-settings-compact');
	});

	it('marks the compact mode as enabled when compact=true', () => {
		const html = renderPanelSettings(baseSettings, dictsByLang.en, true);
		expect(html).toContain('mcpv-panel--compact');
		expect(html).toMatch(/data-settings-compact[^>]*checked/);
	});

	it('honours the configured theme and language', () => {
		const html = renderPanelSettings(
			{ ...baseSettings, theme: 'midnight', language: 'es' },
			dictsByLang.en,
		);
		expect(html).toContain('value="midnight" checked');
		expect(html).toContain('value="es" checked');
		expect(html).not.toContain('dir="rtl"');
	});

	it('switches to RTL when language is Arabic', () => {
		const html = renderPanelSettings(
			{ ...baseSettings, language: 'ar' },
			dictsByLang.en,
		);
		expect(html).toContain('dir="rtl"');
	});
});
