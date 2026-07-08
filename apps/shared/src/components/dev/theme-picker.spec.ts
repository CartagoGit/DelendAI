/**
 * `apps/shared/src/components/dev/theme-picker.spec.ts` —
 * `renderThemePicker` unit tests (f00102 S4.5).
 *
 * Contract pinned:
 *   - root is `<fieldset class="mv-theme-picker__field">` with a
 *     `<legend>Theme</legend>` and a `<div role="radiogroup">`
 *   - three radios: system / light / dark, in that order
 *   - the radio matching `current` carries `checked`
 *   - `hint` is rendered as `<p class="mv-theme-picker__hint">`
 *   - `inline: true` collapses to `<label class="mv-theme-picker
 *     mv-theme-picker--inline">` with no fieldset
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderThemePicker, type ThemeChoice } from './theme-picker';

describe('renderThemePicker', () => {
	it('emits the canonical fieldset + radios', () => {
		const out = renderThemePicker({ current: 'system' });
		expect(out).toContain('<fieldset class="mv-theme-picker__field">');
		expect(out).toContain('<legend>Theme</legend>');
		expect(out).toContain(
			'<div class="mv-theme-picker__radios" role="radiogroup">',
		);
	});

	it('renders all three theme options in the canonical order', () => {
		const out = renderThemePicker({ current: 'system' });
		const sysIx = out.indexOf('value="system"');
		const lightIx = out.indexOf('value="light"');
		const darkIx = out.indexOf('value="dark"');
		expect(sysIx).toBeGreaterThan(-1);
		expect(lightIx).toBeGreaterThan(sysIx);
		expect(darkIx).toBeGreaterThan(lightIx);
	});

	it('marks the current choice as checked', () => {
		const out = renderThemePicker({ current: 'dark' });
		expect(out).toContain('value="dark" checked');
		expect(out).not.toContain('value="system" checked');
		expect(out).not.toContain('value="light" checked');
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
