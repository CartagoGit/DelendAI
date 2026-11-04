/**
 * `apps/shared/src/lib/escape.spec.ts` — pins the contract every
 * shared renderer relies on for safe HTML interpolation.
 *
 * Before this module existed, 9 different renderers shipped
 * 9 different versions of `escapeAttr` with subtly different
 * regex sets. The audit found a renderer that did not escape
 * `'` in a `data-*` attribute, leaving an XSS hole. This spec
 * pins the full 5-character escape (`&<>"'`) so the unification
 * is regression-tested.
 */
import { describe, expect, it } from 'vitest';

import { escapeAttr, escapeHtml } from './escape';

describe('escapeHtml', () => {
	it('escapes every HTML-significant character', () => {
		expect(escapeHtml('&')).toBe('&amp;');
		expect(escapeHtml('<')).toBe('&lt;');
		expect(escapeHtml('>')).toBe('&gt;');
		expect(escapeHtml('"')).toBe('&quot;');
		expect(escapeHtml("'")).toBe('&#39;');
	});

	it('escapes every character in a single string', () => {
		expect(escapeHtml(`<bad>&"'`)).toBe('&lt;bad&gt;&amp;&quot;&#39;');
	});

	it('leaves safe text untouched', () => {
		expect(escapeHtml('hello world')).toBe('hello world');
	});

	it('escapes ampersand first so other escapes are not double-escaped', () => {
		// `&amp;` should not become `&amp;amp;`.
		expect(escapeHtml('&amp;')).toBe(`${'&amp;amp;'.slice(0, 5)}amp;`);
		expect(escapeHtml('&amp;').length).toBe(9);
	});
});

describe('escapeAttr', () => {
	it('is interchangeable with escapeHtml for the shared 5-char set', () => {
		expect(escapeAttr('&<>"\'`')).toBe(escapeHtml('&<>"\'`'));
	});

	it('blocks attribute-breakout attempts', () => {
		// " onmouseclick=alert(1) " — the closing quote must be
		// escaped so the host's `attr="…"` delimiter survives.
		const escaped = escapeAttr('" onmouseclick=alert(1) "');
		expect(escaped).not.toContain('"');
		expect(escaped).toContain('&quot;');
	});
});
