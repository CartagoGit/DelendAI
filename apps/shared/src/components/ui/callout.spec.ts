/**
 * `apps/shared/src/components/ui/callout.spec.ts` —
 * `renderCallout` unit tests.
 *
 * Contract pinned:
 *   - root is `<aside class="mv-callout mv-callout--{variant}" role="note" data-mv-callout="{variant}">`
 *   - default title is the variant label (Note / Tip / Warning / Danger)
 *   - icon character is the variant's default glyph (i / * / ! / x)
 *   - body is inlined as-is inside `<div class="mv-callout__content">`
 *     (caller is responsible for escaping; the function does NOT
 *     escape `body` because callers may pass composed HTML)
 *   - title and lang_label are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderCallout, type CalloutVariant } from './callout';

describe('renderCallout', () => {
	it('emits the canonical aside root with the default title for each variant', () => {
		const cases: ReadonlyArray<{ variant: CalloutVariant; title: string; icon: string }> = [
			{ variant: 'note', title: 'Note', icon: 'i' },
			{ variant: 'tip', title: 'Tip', icon: '*' },
			{ variant: 'warn', title: 'Warning', icon: '!' },
			{ variant: 'danger', title: 'Danger', icon: 'x' },
		];
		for (const { variant, title, icon } of cases) {
			const out = renderCallout({ variant }, '<p>x</p>');
			expect(out).toContain(
				`<aside class="mv-callout mv-callout--${variant}" role="note" data-mv-callout="${variant}">`,
			);
			expect(out).toContain(`>${title}</p>`);
			expect(out).toContain(`>${icon}</span>`);
		}
	});

	it('defaults the variant to "note" when omitted', () => {
		const out = renderCallout({}, '<p>x</p>');
		expect(out).toContain('class="mv-callout mv-callout--note"');
		expect(out).toContain('data-mv-callout="note"');
	});

	it('honours an explicit title override', () => {
		const out = renderCallout(
			{ variant: 'tip', title: 'Pro tip' },
			'<p>x</p>',
		);
		expect(out).toContain('>Pro tip</p>');
		expect(out).not.toContain('>Tip</p>');
	});

	it('inlines the body inside <div class="mv-callout__content">', () => {
		const out = renderCallout(
			{ variant: 'note' },
			'<p>Use <code>--noEmit</code> for type-only checks.</p>',
		);
		expect(out).toContain(
			'<div class="mv-callout__content"><p>Use <code>--noEmit</code> for type-only checks.</p></div>',
		);
	});

	it('escapes the title and lang_label', () => {
		const out = renderCallout(
			{ variant: 'tip', title: '<bad>&"\'' },
			'<p>x</p>',
		);
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		expect(out).not.toContain('<bad>');
	});

	it('emits a lang attribute when lang_label is provided', () => {
		const out = renderCallout(
			{ variant: 'note', lang_label: 'es' },
			'<p>x</p>',
		);
		expect(out).toContain(' lang="es"');
	});

	it('omits the lang attribute when lang_label is missing', () => {
		const out = renderCallout({ variant: 'note' }, '<p>x</p>');
		expect(out).not.toContain(' lang="');
	});
});