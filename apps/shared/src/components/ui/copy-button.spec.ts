/**
 * `apps/shared/src/components/ui/copy-button.spec.ts` —
 * `renderCopyButton` unit tests.
 *
 * Contract pinned:
 *   - root is `<button class="mv-copybtn mv-copybtn--{variant}" data-copy-text="..." aria-label="...">`
 *   - default variant is `ghost`
 *   - default label is `Copy`
 *   - icon glyph is the unicode `⧉` (U+29C9) in
 *     `<span class="mv-copybtn__icon" aria-hidden="true">`
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderCopyButton } from './copy-button';

describe('renderCopyButton', () => {
	it('emits the canonical button root with the default variant + label', () => {
		const out = renderCopyButton({ text: 'npm install x' });
		expect(out).toContain(
			'<button type="button" class="mv-copybtn mv-copybtn--ghost" data-copy-text="npm install x" aria-label="Copy">',
		);
	});

	it('emits the icon glyph + label span', () => {
		const out = renderCopyButton({ text: 'x' });
		expect(out).toContain(
			'<span class="mv-copybtn__icon" aria-hidden="true">⧉</span>',
		);
		expect(out).toContain(
			'<span class="mv-copybtn__label" data-copy-label="idle">Copy</span>',
		);
	});

	it('honours the solid variant', () => {
		const out = renderCopyButton({ text: 'x', variant: 'solid' });
		expect(out).toContain('mv-copybtn--solid');
	});

	it('honours a custom label', () => {
		const out = renderCopyButton({ text: 'x', label: 'Copiar' });
		expect(out).toContain('aria-label="Copiar"');
		expect(out).toContain(
			'<span class="mv-copybtn__label" data-copy-label="idle">Copiar</span>',
		);
	});

	it('escapes HTML in the text (data-copy-text attribute)', () => {
		const out = renderCopyButton({ text: '<bad>&"\'' });
		expect(out).toContain('data-copy-text="&lt;bad&gt;&amp;&quot;&#39;"');
	});

	it('escapes HTML in the label', () => {
		const out = renderCopyButton({ text: 'x', label: '<bad>&"' });
		expect(out).toContain('aria-label="&lt;bad&gt;&amp;&quot;"');
	});
});
