/**
 * `apps/shared/src/components/ui/code-block.spec.ts` —
 * `renderCodeBlock` unit tests.
 *
 * Contract pinned:
 *   - root is `<figure class="delendai-code" data-lang="...">` (or
 *     `delendai-code delendai-code--inline` when `inline: true`)
 *   - body is `<pre class="delendai-code__pre"><code id="..." class="language-...">`
 *   - the `code` is HTML-escaped
 *   - `id` defaults to `cb-XXXXXXX`; copy button `data-copy-target`
 *     links to the same id
 *   - `showCopy: false` omits the copy button + the header
 *   - filename renders as `<span class="delendai-code__file">`; lang as
 *     `<span class="delendai-code__lang">` (only if no filename); caption
 *     as `<span class="delendai-code__caption">`
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderCodeBlock, resetCodeBlockIds } from './code-block';

const codeIdOf = (html: string): string =>
	html.match(/<code id="(cb-[^"]+)"/)?.[1] ?? '';
const copyTargetOf = (html: string): string =>
	html.match(/data-copy-target="(cb-[^"]+)"/)?.[1] ?? '';

describe('renderCodeBlock', () => {
	it('emits the canonical figure + pre + code root', () => {
		const out = renderCodeBlock({ code: 'const x = 1;' });
		expect(out).toContain(
			'<figure class="delendai-code" data-lang="text">',
		);
		expect(out).toContain('<pre class="delendai-code__pre"><code id="cb-');
		expect(out).toContain('class="language-text"');
		expect(out).toContain('const x = 1;');
	});

	it('a00069: auto ids are UNIQUE per pass and DETERMINISTIC across passes (was Math.random)', () => {
		// Two identical-args blocks on one page must NOT share a DOM id —
		// duplicate ids are invalid HTML and make the copy button target the
		// wrong block. And a reset makes a fresh pass reproduce the exact ids
		// (the "stable HTML diff" property the doc always claimed but the old
		// random suffix never delivered).
		resetCodeBlockIds();
		const a = renderCodeBlock({ code: 'same' });
		const b = renderCodeBlock({ code: 'same' });
		expect(codeIdOf(a)).not.toBe(codeIdOf(b)); // unique within a pass
		// The copy button targets its OWN code id in each render.
		expect(copyTargetOf(a)).toBe(codeIdOf(a));
		expect(copyTargetOf(b)).toBe(codeIdOf(b));
		resetCodeBlockIds();
		const a2 = renderCodeBlock({ code: 'same' });
		const b2 = renderCodeBlock({ code: 'same' });
		expect(codeIdOf(a2)).toBe(codeIdOf(a)); // deterministic across passes
		expect(codeIdOf(b2)).toBe(codeIdOf(b));
	});

	it('escapes HTML in the code body', () => {
		const out = renderCodeBlock({ code: '<script>alert(1)</script>' });
		expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(out).not.toContain('<script>');
	});

	it('emits a copy button by default, with the data-copy-target link', () => {
		const out = renderCodeBlock({ code: 'x', id: 'cb-test' });
		expect(out).toContain(
			'<button type="button" class="delendai-code__copy" data-copy-target="cb-test"',
		);
		expect(out).toContain('id="cb-test"');
	});

	it('honours a custom copyLabel', () => {
		const out = renderCodeBlock({ code: 'x', copyLabel: 'Copiar' });
		expect(out).toContain('aria-label="Copiar"');
	});

	it('omits the copy button when showCopy: false', () => {
		const out = renderCodeBlock({ code: 'x', showCopy: false });
		expect(out).not.toContain('delendai-code__copy');
	});

	it('renders filename as <span class="delendai-code__file">', () => {
		const out = renderCodeBlock({
			code: 'x',
			filename: 'index.ts',
			showCopy: false,
		});
		expect(out).toContain(
			'<span class="delendai-code__file">index.ts</span>',
		);
	});

	it('renders lang as <span class="delendai-code__lang"> when no filename', () => {
		const out = renderCodeBlock({
			code: 'x',
			lang: 'ts',
			showCopy: false,
		});
		expect(out).toContain('<span class="delendai-code__lang">ts</span>');
	});

	it('omits lang label when filename is set', () => {
		const out = renderCodeBlock({
			code: 'x',
			filename: 'index.ts',
			lang: 'ts',
			showCopy: false,
		});
		expect(out).not.toContain('delendai-code__lang');
	});

	it('renders caption as <span class="delendai-code__caption">', () => {
		const out = renderCodeBlock({
			code: 'x',
			caption: 'A demo',
			showCopy: false,
		});
		expect(out).toContain(
			'<span class="delendai-code__caption">A demo</span>',
		);
	});

	it('emits the inline variant', () => {
		const out = renderCodeBlock({ code: 'x', inline: true });
		expect(out).toContain('class="delendai-code delendai-code--inline"');
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
			'<span class="delendai-code__file">&lt;bad&gt;&amp;&quot;&#39;</span>',
		);
		expect(out).toContain('data-lang="&quot;&amp;&lt;&gt;"');
	});
});
