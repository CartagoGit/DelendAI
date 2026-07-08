/**
 * `apps/shared/src/components/dev/theme-picker.spec.ts` —
 * `renderThemePicker` unit tests (f00102 S4.5).
 *
 * Contract pinned:
 *   - root is `<fieldset class="mv-theme-picker__field">` with a
 *     `<legend>Theme</legend>` and a `<div role="radiogroup">`
 *   - six radios by default (system / light / dark / midnight /
 *     solarized / nord), in that order — mirrors
 *     `apps/shared/src/styles/_themes.scss`
 *   - hosts may pass `themes:` to restrict to a subset
 *   - the radio matching `current` carries `checked`
 *   - `hint` is rendered as `<p class="mv-theme-picker__hint">`
 *   - `inline: true` collapses to `<label class="mv-theme-picker
 *     mv-theme-picker--inline">` with no fieldset
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import {
	ALL_THEMES,
	renderThemePicker,
	THEME_ORDER,
	type ThemeChoice,
} from './theme-picker';

const ALL_VALUES: ReadonlyArray<ThemeChoice> = [
	'system',
	'light',
	'dark',
	'midnight',
	'solarized',
	'nord',
];

describe('renderThemePicker', () => {
	it('emits the canonical fieldset + radios', () => {
		const out = renderThemePicker({ current: 'system' });
		expect(out).toContain('<fieldset class="mv-theme-picker__field">');
		expect(out).toContain('<legend>Theme</legend>');
		expect(out).toContain(
			'<div class="mv-theme-picker__radios" role="radiogroup">',
		);
	});

	it('renders all six theme options in the canonical order by default', () => {
		const out = renderThemePicker({ current: 'system' });
		let prev = -1;
		for (const value of ALL_VALUES) {
			const idx = out.indexOf(`value="${value}"`);
			expect(idx, `option ${value} should be present`).toBeGreaterThan(-1);
			expect(idx, `${value} should come after its predecessor`).toBeGreaterThan(
				prev,
			);
			prev = idx;
		}
		// Sanity: THEME_ORDER is the in-code default and ALL_THEMES mirrors
		// the same set; they must stay in lockstep or this contract drifts.
		expect(THEME_ORDER).toEqual(ALL_THEMES);
	});

	it('honours a `themes:` subset', () => {
		const out = renderThemePicker({
			current: 'light',
			themes: ['system', 'light', 'dark'],
		});
		expect(out).toContain('value="system"');
		expect(out).toContain('value="light"');
		expect(out).toContain('value="dark"');
		expect(out).not.toContain('value="midnight"');
		expect(out).not.toContain('value="solarized"');
		expect(out).not.toContain('value="nord"');
	});

	it('marks the current choice as checked', () => {
		const out = renderThemePicker({ current: 'midnight' });
		expect(out).toContain('value="midnight" checked');
		expect(out).not.toContain('value="system" checked');
		expect(out).not.toContain('value="light" checked');
		expect(out).not.toContain('value="solarized" checked');
		expect(out).not.toContain('value="nord" checked');
	});

	it('emits a hint paragraph when hint is provided', () => {
		const out = renderThemePicker({
			current: 'system',
			hint: 'Pick a theme',
		});
		expect(out).toContain(
			'<p class="mv-theme-picker__hint">Pick a theme</p>',
		);
	});

	it('omits the hint paragraph when hint is missing', () => {
		const out = renderThemePicker({ current: 'system' });
		expect(out).not.toContain('mv-theme-picker__hint');
	});

	it('honours a custom name', () => {
		const out = renderThemePicker({ current: 'light', name: 'app-theme' });
		expect(out).toContain('name="app-theme"');
	});

	it('renders the inline variant without a fieldset', () => {
		const out = renderThemePicker({ current: 'system', inline: true });
		expect(out).toContain(
			'<label class="mv-theme-picker mv-theme-picker--inline">',
		);
		expect(out).not.toContain('<fieldset');
		expect(out).not.toContain('<legend>');
	});

	it('escapes HTML in the hint and option labels', () => {
		const out = renderThemePicker({
			current: 'system',
			hint: '<bad>&"\'',
		});
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		expect(out).not.toContain('<bad>');
	});
});
