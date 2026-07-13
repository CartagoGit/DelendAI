/**
 * `apps/shared/src/components/ui/site-footer.spec.ts` —
 * `renderSiteFooter` unit tests.
 *
 * Contract pinned:
 *   - root is a sequence of <div>s the host wraps in
 *     `<footer class="mcpv-sitefoot sitefoot">`
 *   - 3 columns: brand (with tagline + madeBy), sections nav,
 *     resources nav (5 external/internal links)
 *   - the base row carries the year + the `built` label
 *   - `labels` are merged with `DEFAULT_LABELS` (host overrides win)
 *   - `urls` are merged with `DEFAULT_URLS` (host overrides win)
 *   - `sections` defaults to the canonical 7-entry list; the host
 *     can override the list entirely
 *   - `resolveHref` collapses the trailing-slash: `baseHref="/"`
 *     + `href="/install"` → `/install`; `baseHref="/es/"` +
 *     `href="/install"` → `/es/install`
 *   - section hrefs are localised via `resolveHref`
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderSiteFooter } from './site-footer';

describe('renderSiteFooter', () => {
	it('emits the 3-column inner + base row', () => {
		const out = renderSiteFooter({
			lang: 'en',
			baseHref: '/',
			year: 2026,
			labels: {},
		});
		expect(out).toContain('<div class="mcpv-sitefoot__inner">');
		expect(out).toContain('mcpv-sitefoot__col--brand');
		expect(out).toContain(
			'<nav class="mcpv-sitefoot__col" aria-label="Sections">',
		);
		expect(out).toContain(
			'<nav class="mcpv-sitefoot__col" aria-label="Resources">',
		);
		expect(out).toContain('<div class="mcpv-sitefoot__base">');
		expect(out).toContain('© 2026 mcp-vertex');
	});

	it('renders the 7 default sections', () => {
		const out = renderSiteFooter({
			lang: 'en',
			baseHref: '/',
			year: 2026,
			labels: {},
		});
		const expectedKeys = [
			'install',
			'tools',
			'benchmarks',
			'plugins',
			'prompts',
			'resources',
			'knowledge',
		];
		for (const k of expectedKeys) {
			expect(out).toContain(`data-nav-key="${k}"`);
		}
	});

	it('honours a custom sections list', () => {
		const out = renderSiteFooter({
			lang: 'en',
			baseHref: '/',
			year: 2026,
			labels: {},
			sections: [{ id: 'a', label: 'A', href: '/a' }],
		});
		expect(out).toContain('data-nav-key="a"');
		expect(out).not.toContain('data-nav-key="install"');
	});

	it('honours label overrides', () => {
		const out = renderSiteFooter({
			lang: 'es',
			baseHref: '/es/',
			year: 2026,
			labels: {
				tagline: 'Mi tagline',
				madeBy: 'Hecho por X',
				sections: 'Secciones',
				resources: 'Recursos',
				built: 'Construido con Bun',
				install: 'Instalar',
				tools: 'Herramientas',
				benchmarks: 'Benchmarks',
				plugins: 'Plugins',
				prompts: 'Prompts',
				knowledge: 'Conocimiento',
				creatorsRepo: 'CartagoGit · GitHub',
				creatorsNpm: 'CartagoGit · npm',
			},
		});
		expect(out).toContain('Mi tagline');
		expect(out).toContain('Hecho por X');
		expect(out).toContain('Secciones');
		expect(out).toContain('Construido con Bun');
	});

	it('honours URL overrides', () => {
		const out = renderSiteFooter({
			lang: 'en',
			baseHref: '/',
			year: 2026,
			labels: {},
			urls: {
				repo: 'https://example.com/repo',
				creatorsRepo: 'https://example.com/creators',
				creatorsNpm: 'https://example.com/npm',
				npmPackage: 'https://example.com/pkg',
				apiDocs: 'docs/api/',
			},
		});
		expect(out).toContain('href="https://example.com/repo"');
		expect(out).toContain('href="https://example.com/creators"');
		expect(out).toContain('href="https://example.com/npm"');
		expect(out).toContain('href="https://example.com/pkg"');
	});

	it('localises section hrefs via resolveHref', () => {
		const out = renderSiteFooter({
			lang: 'es',
			baseHref: '/es/',
			year: 2026,
			labels: {},
		});
		// `baseHref="/es/"` + `href="/install"` → `/es/install` (no
		// double slash, no trailing slash).
		expect(out).toContain('href="/es/install"');
		expect(out).toContain('href="/es/tools"');
	});

	it('keeps absolute hrefs when baseHref is "/"', () => {
		const out = renderSiteFooter({
			lang: 'en',
			baseHref: '/',
			year: 2026,
			labels: {},
		});
		expect(out).toContain('href="/install"');
		expect(out).toContain('href="/tools"');
	});

	it('escapes HTML in custom labels + sections', () => {
		const out = renderSiteFooter({
			lang: 'en',
			baseHref: '/',
			year: 2026,
			labels: {
				tagline: '<bad>&"\'',
				madeBy: '<x>',
				sections: 'Sections',
				resources: 'Resources',
				built: 'Built',
				install: 'Install',
				tools: 'Tools',
				benchmarks: 'Benchmarks',
				plugins: 'Plugins',
				prompts: 'Prompts',
				knowledge: 'Knowledge',
				creatorsRepo: 'GH',
				creatorsNpm: 'npm',
			},
			sections: [{ id: 'a', label: '<x>&"\'', href: '/?a=<b>' }],
		});
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		expect(out).toContain('&lt;x&gt;');
		expect(out).toContain('href="/?a=&lt;b&gt;"');
	});
});
