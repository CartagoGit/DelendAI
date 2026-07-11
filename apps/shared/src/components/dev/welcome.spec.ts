/**
 * `apps/shared/src/components/dev/welcome.spec.ts` —
 * `renderFirstRunScreen` / `renderQuickStartMenu` unit tests
 * (f00102 S4.6).
 *
 * Contract pinned:
 *   - `CARDS` has the canonical 4 entries (Dashboard, Settings,
 *     Tool detail, Metrics) in that order
 *   - `renderFirstRunScreen(installLabel)` returns a
 *     `<section class="mcpv-welcome welcome" data-first-run="true">`
 *     with 4 `<article class="mcpv-welcome__card welcome__card">`
 *     children + install + skip CTAs
 *   - `renderQuickStartMenu()` returns an
 *     `<aside class="mcpv-quickstart quickstart">` with 4 list
 *     items + dismiss button
 *   - all interpolations are HTML-escaped (label, body, icon)
 *   - `isQuickStartDismissed` / `dismissQuickStart` round-trip
 *     through sessionStorage
 */
import { describe, expect, it } from 'vitest';

import {
	CARDS,
	dismissQuickStart,
	isQuickStartDismissed,
	renderFirstRunScreen,
	renderQuickStartMenu,
} from './welcome';

describe('welcome — CARDS', () => {
	it('has the canonical 4 entries in the canonical order', () => {
		expect(CARDS).toHaveLength(4);
		expect(CARDS.map((c) => c.title)).toEqual([
			'Dashboard',
			'Settings',
			'Tool detail',
			'Metrics',
		]);
	});
});

describe('renderFirstRunScreen', () => {
	it('emits the canonical section + cards + CTAs', () => {
		const out = renderFirstRunScreen('Install mcp-vertex');
		expect(out).toContain(
			'<section class="mcpv-welcome welcome" data-first-run="true">',
		);
		expect(out).toContain(
			'<header class="mcpv-welcome__head welcome__head">',
		);
		expect(out).toContain('<div class="mcpv-welcome__grid welcome__grid">');
		expect(out).toContain(
			'<footer class="mcpv-welcome__cta welcome__cta">',
		);
		expect(out).toContain('<button type="button" id="welcome-install"');
		expect(out).toContain('<button type="button" id="welcome-skip"');
	});

	it('renders all 4 cards with the canonical classes', () => {
		const out = renderFirstRunScreen('Install');
		const matches = out.match(
			/<article class="mcpv-welcome__card welcome__card">/g,
		);
		expect(matches).toHaveLength(4);
	});

	it('escapes HTML in the install label', () => {
		const out = renderFirstRunScreen('<bad>&"\'');
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		expect(out).not.toContain('<bad>');
	});
});

describe('renderQuickStartMenu', () => {
	it('emits the canonical aside + list + dismiss', () => {
		const out = renderQuickStartMenu();
		expect(out).toContain(
			'<aside class="mcpv-quickstart quickstart" role="complementary">',
		);
		expect(out).toContain(
			'<ul class="mcpv-quickstart__list quickstart__list">',
		);
		expect(out).toContain('<button type="button" id="quickstart-dismiss"');
	});

	it('renders all 4 list items', () => {
		const out = renderQuickStartMenu();
		const matches = out.match(
			/<li class="mcpv-quickstart__item quickstart__item">/g,
		);
		expect(matches).toHaveLength(4);
	});
});

describe('isQuickStartDismissed / dismissQuickStart', () => {
	it('round-trips through sessionStorage', () => {
		const KEY = 'mcpv:dev:quickstart-dismissed';
		sessionStorage.removeItem(KEY);
		expect(isQuickStartDismissed()).toBe(false);
		dismissQuickStart();
		expect(isQuickStartDismissed()).toBe(true);
		sessionStorage.removeItem(KEY);
	});

	it('returns false when sessionStorage is empty', () => {
		sessionStorage.removeItem('mcpv:dev:quickstart-dismissed');
		expect(isQuickStartDismissed()).toBe(false);
	});
});
