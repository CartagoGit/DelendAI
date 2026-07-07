/**
 * `apps/shared/src/components/ui/brand-mark.spec.ts` —
 * `renderBrandMark` unit tests (f00102 S3.3).
 *
 * Contract pinned:
 *   - root is `<a class="mv-brand mv-brand--{variant}" href="...">`
 *   - logo is `<img class="mv-brand__logo" loading="lazy" decoding="async">`
 *   - text is `<span class="mv-brand__text">{brandText}</span>`
 *   - default variant is `pill`
 *   - empty `brandText` is allowed (logo-only mark)
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderBrandMark } from './brand-mark';

describe('renderBrandMark', () => {
	it('emits the canonical pill anchor + logo + text', () => {
		const out = renderBrandMark({
			href: '/es/',
			logoSrc: '/logo.svg',
			brandText: '@mcp-vertex',
		});
		expect(out).toContain('class="mv-brand mv-brand--pill"');
		expect(out).toContain('href="/es/"');
		expect(out).toContain('class="mv-brand__logo"');
		expect(out).toContain('src="/logo.svg"');
		expect(out).toContain('loading="lazy"');
		expect(out).toContain('decoding="async"');
		expect(out).toContain('class="mv-brand__text"');
		expect(out).toContain('@mcp-vertex');
	});

	it('respects the variant=plain modifier', () => {
		const out = renderBrandMark({
			href: '/',
			logoSrc: '/logo.svg',
			brandText: 'X',
			variant: 'plain',
		});
		expect(out).toContain('class="mv-brand mv-brand--plain"');
	});

	it('defaults the logo size to 26×26', () => {
		const out = renderBrandMark({
			href: '/',
			logoSrc: '/logo.svg',
			brandText: 'X',
		});
		expect(out).toContain('width="26"');
		expect(out).toContain('height="26"');
	});

	it('honours custom logo size', () => {
		const out = renderBrandMark({
			href: '/',
			logoSrc: '/logo.svg',
			brandText: 'X',
			logoWidth: 40,
			logoHeight: 40,
		});
		expect(out).toContain('width="40"');
		expect(out).toContain('height="40"');
	});

	it('allows an empty brandText (logo-only mark)', () => {
		const out = renderBrandMark({
			href: '/',
			logoSrc: '/logo.svg',
			brandText: '',
		});
		expect(out).toContain('class="mv-brand__text"></span>');
	});

	it('escapes HTML in the href', () => {
		const out = renderBrandMark({
			href: '/x?a=1&b=<script>',
			logoSrc: '/logo.svg',
			brandText: 'X',
		});
		expect(out).toContain('href="/x?a=1&amp;b=&lt;script&gt;"');
		expect(out).not.toContain('<script>');
	});

	it('escapes HTML in the logoSrc and brandText', () => {
		const out = renderBrandMark({
			href: '/',
			logoSrc: '/logo.svg?x="&<>',
			brandText: '<bad>',
		});
		expect(out).toContain('src="/logo.svg?x=&quot;&amp;&lt;&gt;"');
		expect(out).toContain('<span class="mv-brand__text">&lt;bad&gt;</span>');
	});

	it('emits a valid empty alt by default', () => {
		const out = renderBrandMark({
			href: '/',
			logoSrc: '/logo.svg',
			brandText: 'X',
		});
		expect(out).toContain('alt=""');
	});
});