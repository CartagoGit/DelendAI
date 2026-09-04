import { describe, expect, it } from 'vitest';
import type { IDashboardAllModels, IExtensionSettings } from '@delendai/client';
import { buildHeader } from '../../../src/dashboard/builders/build-header';

describe('buildHeader', () => {
	const baseSettings = {
		docsUrl: 'https://mcp-vertex.dev',
		allowLocalhost: false,
		allowPrivateIps: false,
		logLevel: 'info',
		theme: 'system',
		language: 'en',
		motion: 'system',
	} as const satisfies IExtensionSettings;

	const mockModel = {
		server: {
			name: 'mcp-vertex-test',
			version: '1.2.3',
			fetchedAt: '2026-06-28T19:00:00Z',
		},
	} as unknown as IDashboardAllModels;

	it('renders the header correctly', () => {
		const html = buildHeader(mockModel);
		expect(html).toContain('mcp-vertex-test');
		expect(html).toContain('1.2.3');
	});

	it('renders the language picker with the current language', () => {
		const html = buildHeader(mockModel, baseSettings);
		expect(html).toContain('data-header-lang');
		expect(html).toContain('value="en" selected');
	});

	it('renders the theme switcher with the current theme', () => {
		const html = buildHeader(mockModel, baseSettings);
		expect(html).toContain('data-header-theme');
		expect(html).toContain('value="system" selected');
	});

	it('reflects the persisted settings', () => {
		const html = buildHeader(mockModel, {
			...baseSettings,
			theme: 'midnight',
			language: 'es',
		});
		expect(html).toContain('value="midnight" selected');
		expect(html).toContain('value="es" selected');
	});

	it('embeds the current-language flag as an inline SVG', () => {
		const html = buildHeader(mockModel, baseSettings);
		expect(html).toMatch(/<svg[^>]*aria-label="United Kingdom"/);
	});

	it('embeds the current-language flag when the language changes', () => {
		const html = buildHeader(mockModel, {
			...baseSettings,
			language: 'es',
		});
		expect(html).toMatch(/<svg[^>]*aria-label="Spain"/);
	});
});
