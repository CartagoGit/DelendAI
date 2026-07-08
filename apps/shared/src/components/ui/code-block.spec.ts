/**
 * `apps/shared/src/components/ui/code-block.spec.ts` —
 * `renderCodeBlock` unit tests.
 *
 * Contract pinned:
 *   - root is `<figure class="mv-code" data-lang="...">` (or
 *     `mv-code mv-code--inline` when `inline: true`)
 *   - body is `<pre class="mv-code__pre"><code id="..." class="language-...">`
 *   - the `code` is HTML-escaped
 *   - `id` defaults to `cb-XXXXXXX`; copy button `data-copy-target`
 *     links to the same id
 *   - `showCopy: false` omits the copy button + the header
 *   - filename renders as `<span class="mv-code__file">`; lang as
 *     `<span class="mv-code__lang">` (only if no filename); caption
 *     as `<span class="mv-code__caption">`
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderCodeBlock } from './code-block';

describe('renderCodeBlock', () => {
	it('emits the canonical figure + pre + code root', () => {
		const out = renderCodeBlock({ code: 'const x = 1;' });
		expect(out).toContain('<figure class="mv-code" data-lang="text">');
		expect(out).toContain('<pre class="mv-code__pre"><code id="cb-');
		expect(out).toContain('class="language-text"');
		expect(out).toContain('const x = 1;');
	});

	it('escapes HTML in the code body', () => {
		const out = renderCodeBlock({ code: '<script>alert(1)</script>' });
		expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(out).not.toContain('<script>');
	});

	it('emits a copy button by default, with the data-copy-target link', () => {
		const out = renderCodeBlock({ code: 'x', id: 'cb-test' });
		expect(out).toContain(
			'<button type="button" class="mv-code__copy" data-copy-target="cb-test"',
		);
		expect(out).toContain('id="cb-test"');
	});

	it('honours a custom copyLabel', () => {
		const out = renderCodeBlock({ code: 'x', copyLabel: 'Copiar' });
		expect(out).toContain('aria-label="Copiar"');
	});

	it('omits the copy button when showCopy: false', () => {
		const out = renderCodeBlock({ code: 'x', showCopy: false });
		expect(out).not.toContain('mv-code__copy');
	});

	it('renders filename as <span class="mv-code__file">', () => {
		const out = renderCodeBlock({
			code: 'x',
			filename: 'index.ts',
			showCopy: false,
		});
		expect(out).toContain('<span class="mv-code__file">index.ts</span>');
	});

	it('renders lang as <span class="mv-code__lang"> when no filename', () => {
		const out = renderCodeBlock({
			code: 'x',
			lang: 'ts',
			showCopy: false,
		});
		expect(out).toContain('<span class="mv-code__lang">ts</span>');
	});

	it('omits lang label when filename is set', () => {
		const out = renderCodeBlock({
			code: 'x',
			filename: 'index.ts',
			lang: 'ts',
			showCopy: false,
		});
		expect(out).not.toContain('mv-code__lang');
	});

	it('renders caption as <span class="mv-code__caption">', () => {
		const out = renderCodeBlock({
			code: 'x',
			caption: 'A demo',
			showCopy: false,
		});
		expect(out).toContain('<span class="mv-code__caption">A demo</span>');
	});

	it('emits the inline variant', () => {
		const out = renderCodeBlock({ code: 'x', inline: true });
		expect(out).toContain('class="mv-code mv-code--inline"');
	});

	it('escapes filename, lang, and caption', () => {
		const out = renderCodeBlock({
			code: 'x',
			filename: '<bad>&"\'',
			lang: '"&<>',
			caption: '"&<>',
			showCopy: false,
		});
		expect(out).toContain(
			'<span class="mv-code__file">&lt;bad&gt;&amp;&quot;&#39;</span>',
		);
		expect(out).toContain('data-lang="&quot;&amp;&lt;&gt;"');
	});
});
