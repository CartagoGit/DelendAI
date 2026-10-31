import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';

/**
 * Pins the renderer config used by `MarkdownPage.astro` against
 * markdown-it 15 + linkify-it 6 (Dependabot PR 41). 15 ships its own
 * types; linkify-it 6 still fuzzy-links bare hostnames by default, so
 * the renderer explicitly disables fuzzy links — only explicit-scheme
 * URLs and emails autolink.
 */
const markdown = new MarkdownIt({
	html: false,
	linkify: true,
});
markdown.linkify.set({ fuzzyLink: false });

describe('markdown-it 15 (apps/web renderer)', () => {
	it('constructs from the default export and renders a heading', () => {
		expect(markdown.render('# Hi')).toContain('<h1>Hi</h1>');
	});

	it('linkifies explicit-scheme URLs', () => {
		expect(markdown.render('See https://example.com')).toContain(
			'href="https://example.com"',
		);
	});

	it('does not fuzzy-link a bare hostname (linkify-it v6)', () => {
		expect(markdown.render('see example.com/foo')).not.toContain('<a ');
	});

	it('does not pass raw HTML through', () => {
		expect(markdown.render('<script>alert(1)</script>')).not.toContain(
			'<script>',
		);
	});
});
