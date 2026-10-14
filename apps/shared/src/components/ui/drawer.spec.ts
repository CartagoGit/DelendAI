/**
 * `apps/shared/src/components/ui/drawer.spec.ts` —
 * `renderDrawer` unit tests (f00102 S3.3).
 *
 * Contract pinned:
 *   - root `<div class="delendai-drawer delendai-drawer--{side}" id role dialog
 *     aria-modal aria-label hidden>` is emitted by default
 *   - panel is `<aside class="delendai-drawer__panel delendai-drawer__panel--{side}">`
 *   - backdrop carries `data-drawer-close`
 *   - close button carries `data-drawer-close` and `aria-label`
 *   - link list carries `data-drawer-link` by default; pass
 *     `closeOnClick: false` to suppress it
 *   - `panelOnly: true` strips the root div and emits body only
 *   - `className` extra is added to the root class list (legacy)
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderDrawer, type IDrawerLink, type IDrawerProps } from './drawer';

const baseProps = (overrides: Partial<IDrawerProps> = {}): IDrawerProps => ({
	id: 'nav-drawer',
	label: 'Primary menu',
	links: [
		{ key: 'home', label: 'Home', href: '/' },
		{ key: 'install', label: 'Install', href: '/install' },
	] satisfies ReadonlyArray<IDrawerLink>,
	closeLabel: 'Close menu',
	...overrides,
});

describe('renderDrawer', () => {
	it('emits the canonical right-side root + panel', () => {
		const out = renderDrawer(baseProps());
		expect(out).toContain('class="delendai-drawer delendai-drawer--right"');
		expect(out).toContain('id="nav-drawer"');
		expect(out).toContain('role="dialog"');
		expect(out).toContain('aria-modal="true"');
		expect(out).toContain('aria-label="Primary menu"');
		expect(out).toContain('hidden');
		expect(out).toContain(
			'<aside class="delendai-drawer__panel delendai-drawer__panel--right">',
		);
	});

	it('honours the left side modifier', () => {
		const out = renderDrawer(baseProps({ side: 'left' }));
		expect(out).toContain('delendai-drawer--left');
		expect(out).toContain('delendai-drawer__panel--left');
	});

	it('emits the backdrop with the close affordance hook', () => {
		const out = renderDrawer(baseProps());
		expect(out).toContain(
			'<div class="delendai-drawer__backdrop" data-drawer-close>',
		);
	});

	it('emits a close button with aria-label', () => {
		const out = renderDrawer(baseProps());
		expect(out).toContain('class="delendai-drawer__close"');
		expect(out).toContain('data-drawer-close');
		expect(out).toContain('aria-label="Close menu"');
	});

	it('renders the link list with data-drawer-link by default', () => {
		const out = renderDrawer(baseProps());
		expect(out).toContain('data-nav-key="install"');
		expect(out).toContain('href="/install"');
		expect(out).toContain('data-drawer-link');
	});

	it('skips data-drawer-link when closeOnClick is false', () => {
		const out = renderDrawer(
			baseProps({
				links: [
					{ key: 'k', label: 'L', href: '/x', closeOnClick: false },
				],
			}),
		);
		expect(out).not.toContain('data-drawer-link');
		expect(out).toContain('href="/x"');
	});

	it('marks external links with rel="external"', () => {
		const out = renderDrawer(
			baseProps({
				links: [
					{
						key: 'gh',
						label: 'GitHub',
						href: 'https://example.com',
						external: true,
					},
				],
			}),
		);
		expect(out).toContain('rel="external"');
		expect(out).toContain('href="https://example.com"');
	});

	it('renders the brand mark in the panel head when supplied', () => {
		const out = renderDrawer(
			baseProps({
				brand: {
					href: '/',
					logoSrc: '/logo.svg',
					brandText: '@delendai',
				},
			}),
		);
		expect(out).toContain('class="delendai-drawer__brand"');
		expect(out).toContain(
			'<strong class="delendai-drawer__brand-text">@delendai</strong>',
		);
	});

	it('renders the footer when footHtml is supplied', () => {
		const out = renderDrawer(
			baseProps({ footHtml: '<button>OK</button>' }),
		);
		expect(out).toContain(
			'<div class="delendai-drawer__foot"><button>OK</button></div>',
		);
	});

	it('panelOnly=true emits body only (no root div)', () => {
		const out = renderDrawer(baseProps(), { panelOnly: true });
		// The body still contains `delendai-drawer__backdrop` /
		// `delendai-drawer__panel` / `delendai-drawer__head`, so we pin the
		// absence of the root specifically — no `delendai-drawer--{side}`
		// root modifier and no `role="dialog"`.
		expect(out).not.toContain('role="dialog"');
		expect(out).not.toContain('delendai-drawer--right"');
		expect(out).toContain('<aside class="delendai-drawer__panel');
		expect(out).toContain('data-drawer-close');
	});

	it('className option appends extra classes to the root', () => {
		const out = renderDrawer(baseProps(), { className: 'drawer' });
		expect(out).toContain(
			'class="delendai-drawer delendai-drawer--right drawer"',
		);
	});

	it('escapes HTML in id, label, href, link label', () => {
		const out = renderDrawer(
			baseProps({
				id: 'evil"><script>',
				label: '"><img onerror>',
				links: [{ label: 'X & Y', href: '/?a=<b>' }],
			}),
		);
		expect(out).toContain('id="evil&quot;&gt;&lt;script&gt;"');
		expect(out).toContain('aria-label="&quot;&gt;&lt;img onerror&gt;"');
		expect(out).toContain('href="/?a=&lt;b&gt;"');
		expect(out).toContain('X &amp; Y');
	});
});
