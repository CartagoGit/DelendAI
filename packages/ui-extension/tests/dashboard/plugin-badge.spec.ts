import { describe, expect, it } from 'vitest';

import {
	allBrandCodes,
	hasBrandIcon,
	hasFlagIcon,
	languageFlag,
	renderBrandIcon,
	renderFlagIcon,
} from '../../src/dashboard/brand-icons';
import { renderPluginBadge } from '../../src/dashboard/plugin-badge';

describe('brand-icons', () => {
	it('renders a real SVG for every supported brand code', () => {
		for (const code of allBrandCodes()) {
			expect(renderBrandIcon(code).startsWith('<svg')).toBe(true);
		}
	});

	it('exposes a brand for github, gitlab and remote-provider', () => {
		expect(hasBrandIcon('github')).toBe(true);
		expect(hasBrandIcon('gitlab')).toBe(true);
		expect(hasBrandIcon('remote-provider')).toBe(true);
	});

	it('renders a real flag SVG for every supported language', () => {
		for (const code of [
			'ar',
			'de',
			'en',
			'es',
			'fr',
			'hi',
			'it',
			'ja',
			'pt',
			'th',
			'vi',
			'zh',
		] as const) {
			expect(hasFlagIcon(code)).toBe(true);
			expect(languageFlag(code).startsWith('<svg')).toBe(true);
			expect(renderFlagIcon(code).startsWith('<svg')).toBe(true);
		}
	});

	it('falls back to an empty string for an unknown brand', () => {
		expect(renderBrandIcon('not-a-real-plugin')).toBe('');
	});
});

describe('renderPluginBadge', () => {
	it('embeds the GitHub brand SVG for the github plugin', () => {
		const html = renderPluginBadge({ code: 'github', label: 'GitHub' });
		expect(html).toContain('delendai-badge--brand');
		expect(html).toContain('aria-label="GitHub"');
	});

	it('falls back to initials for plugins without a brand mark', () => {
		const html = renderPluginBadge({ code: 'memory', label: 'Memory' });
		expect(html).toContain('delendai-badge--initials');
		expect(html).toContain('M');
	});

	it('honours the requested size', () => {
		const html = renderPluginBadge({
			code: 'github',
			label: 'GitHub',
			size: 32,
		});
		expect(html).toContain('--delendai-badge-size:32px');
	});
});
