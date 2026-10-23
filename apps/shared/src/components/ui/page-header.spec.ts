/**
 * `apps/shared/src/components/ui/page-header.spec.ts` —
 * `renderPageHeader` unit tests.
 *
 * Contract pinned:
 *   - root is `<div class="delendai-page-header__inner">` (the host
 *     wraps it in `<header class="delendai-page-header">`)
 *   - `title` renders inside `<h1 class="delendai-page-header__title">`
 *   - when `crumbs` is empty + `baseHref` is provided, the renderer
 *     adds a single "Home" crumb (current page); when 1+ crumbs
 *     are passed, a "Home" crumb is prepended automatically
 *   - the last crumb is rendered as
 *     `<span aria-current="page">`; earlier crumbs are
 *     `<a href="...">`
 *   - the crumb list is wrapped in
 *     `<nav class="delendai-page-header__crumb" aria-label="breadcrumb">`
 *   - `homeHref` is a legacy alias for `baseHref`
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderPageHeader } from './page-header';

describe('renderPageHeader', () => {
	it('emits the canonical delendai-page-header__inner root', () => {
		const out = renderPageHeader({
			lang: 'en',
			title: 'Tools',
			baseHref: '/',
		});
		expect(out).toContain('<div class="delendai-page-header__inner">');
	});

	it('renders the title in an <h1 class="delendai-page-header__title">', () => {
		const out = renderPageHeader({
			lang: 'en',
			title: 'Tools',
			baseHref: '/',
		});
		expect(out).toContain(
			'<h1 class="delendai-page-header__title">Tools</h1>',
		);
	});

	it('omits the crumb nav when no crumbs are provided', () => {
		const out = renderPageHeader({
			lang: 'en',
			title: 'Tools',
			baseHref: '/',
		});
		expect(out).not.toContain('delendai-page-header__crumb');
	});

	it('prepends an automatic "Home" crumb when crumbs are non-empty', () => {
		const out = renderPageHeader({
			lang: 'en',
			title: 'Tools',
			crumbs: [{ label: 'Tools', href: '/tools' }],
			baseHref: '/',
		});
		expect(out).toContain(
			'<nav class="delendai-page-header__crumb" aria-label="breadcrumb">',
		);
		expect(out).toContain('href="/"');
		expect(out).toContain('>Home</a>');
		expect(out).toContain('<span aria-current="page">Tools</span>');
	});

	it('marks only the last crumb as aria-current="page"', () => {
		const out = renderPageHeader({
			lang: 'es',
			title: 'Recursos',
			crumbs: [
				{ label: 'A', href: '/a' },
				{ label: 'B', href: '/b' },
			],
			baseHref: '/',
			homeLabel: 'Inicio',
		});
		expect(out).toContain('aria-current="page">B</span>');
		expect(out).not.toContain('aria-current="page">A</span>');
	});

	it('honours a custom homeLabel', () => {
		const out = renderPageHeader({
			lang: 'es',
			title: 'Recursos',
			crumbs: [{ label: 'R', href: '/r' }],
			baseHref: '/',
			homeLabel: 'Inicio',
		});
		expect(out).toContain('>Inicio</a>');
	});

	it('emits the baseHref in the Home crumb link', () => {
		const out = renderPageHeader({
			lang: 'en',
			title: 'X',
			crumbs: [{ label: 'X', href: '/x' }],
			baseHref: '/es/',
		});
		expect(out).toContain('href="/es/"');
	});

	it('escapes HTML in title and crumb labels/hrefs', () => {
		const out = renderPageHeader({
			lang: 'en',
			title: '<bad>&"\'',
			crumbs: [
				{ label: 'A<x>', href: '/?a=<b>' },
				{ label: 'Z', href: '/z' },
			],
			baseHref: '/',
		});
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		// Both the link label and the href on the first crumb are
		// escaped. (Only non-trailing crumbs are emitted as <a>;
		// the trailing crumb is `aria-current="page"`.)
		expect(out).toContain('href="/?a=&lt;b&gt;"');
		expect(out).toContain('>A&lt;x&gt;</a>');
	});
});
