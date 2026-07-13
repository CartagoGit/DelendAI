/**
 * `apps/shared/src/components/ui/tabs.spec.ts` —
 * `renderTabs` unit tests.
 *
 * Contract pinned:
 *   - root is `<nav class="mcpv-tabs__bar" aria-label="...">` with
 *     `<ul role="tablist" class="mcpv-tabs__list">` inside
 *   - one `<li role="presentation"><button role="tab">` per tab
 *   - first tab is the default (aria-selected="true", tabindex=0)
 *   - non-default tabs are aria-selected="false", tabindex=-1
 *   - `id` defaults to `mcpv-tab-{id}`; `aria-controls` defaults to
 *     `mcpv-panel-{id}`. Override via `idPrefix`.
 *   - `actionHtml` renders as a non-tab `<li class="mcpv-tabs__action">`
 *   - `variant` is stamped as a `data-tabs-variant` attribute on
 *     the nav
 *   - the `icon` field renders as a `<span data-mcpv-icon>` wrapper
 *     containing both the `<img>` and a first-letter fallback
 *     span. NO inline `onerror=` JavaScript is emitted (f00099
 *     audit follow-up — fallback is wired by `renderRuntime`).
 *   - the `badge` field renders as `<span class="mcpv-tabs__badge">`
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import { renderTabs } from './tabs';

describe('renderTabs', () => {
	it('emits the canonical nav + tablist root', () => {
		const out = renderTabs({
			tabs: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
		});
		expect(out).toContain(
			'<nav class="mcpv-tabs__bar" aria-label="Sections" data-tabs-variant="underline">',
		);
		expect(out).toContain('<ul role="tablist" class="mcpv-tabs__list">');
	});

	it('renders one <li role="presentation"> per tab', () => {
		const out = renderTabs({
			tabs: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
				{ id: 'c', label: 'C' },
			],
		});
		expect(out.match(/<li role="presentation">/g) ?? []).toHaveLength(3);
	});

	it('marks the first tab as the default (selected, tabindex=0)', () => {
		const out = renderTabs({
			tabs: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
		});
		expect(out).toContain('id="mcpv-tab-a"');
		expect(out).toMatch(
			/id="mcpv-tab-a"[^>]*aria-selected="true"[^>]*tabindex="0"/,
		);
	});

	it('marks non-default tabs as unselected (tabindex=-1)', () => {
		const out = renderTabs({
			tabs: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
		});
		expect(out).toMatch(
			/id="mcpv-tab-b"[^>]*aria-selected="false"[^>]*tabindex="-1"/,
		);
	});

	it('honours an explicit defaultTab', () => {
		const out = renderTabs({
			tabs: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
			defaultTab: 'b',
		});
		expect(out).toMatch(
			/id="mcpv-tab-b"[^>]*aria-selected="true"[^>]*tabindex="0"/,
		);
	});

	it('emits aria-controls pointing at the panel', () => {
		const out = renderTabs({
			tabs: [{ id: 'overview', label: 'Overview' }],
		});
		expect(out).toContain('aria-controls="mcpv-panel-overview"');
	});

	it('honours a custom idPrefix', () => {
		const out = renderTabs({
			tabs: [{ id: 'overview', label: 'Overview' }],
			idPrefix: '',
		});
		expect(out).toContain('id="tab-overview"');
		expect(out).toContain('aria-controls="panel-overview"');
	});

	it('stamps data-tab-trigger on every tab button', () => {
		const out = renderTabs({
			tabs: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
		});
		expect(out).toContain('data-tab-trigger="a"');
		expect(out).toContain('data-tab-trigger="b"');
	});

	it('honours a custom aria-label', () => {
		const out = renderTabs({
			tabs: [{ id: 'a', label: 'A' }],
			label: 'Dashboard sections',
		});
		expect(out).toContain('aria-label="Dashboard sections"');
	});

	it('emits a non-tab action <li> when actionHtml is provided', () => {
		const out = renderTabs({
			tabs: [{ id: 'a', label: 'A' }],
			actionHtml: '<button id="tab-refresh">⟳</button>',
		});
		expect(out).toContain(
			'<li role="presentation" class="mcpv-tabs__action">',
		);
		expect(out).toContain('<button id="tab-refresh">⟳</button>');
	});

	it('emits the variant via data-tabs-variant', () => {
		const out = renderTabs({
			tabs: [{ id: 'a', label: 'A' }],
			variant: 'pill',
		});
		expect(out).toContain('data-tabs-variant="pill"');
	});

	it('renders the icon as a <span data-mcpv-icon> wrapper with NO inline onerror', () => {
		const out = renderTabs({
			tabs: [
				{
					id: 'a',
					label: 'A',
					icon: '/logos/a.svg',
				},
			],
		});
		expect(out).toContain('<span class="mcpv-tabs__icon" data-mcpv-icon');
		expect(out).toContain('src="/logos/a.svg"');
		// Fallback span: first letter, in the same wrapper.
		expect(out).toContain('<span class="mcpv-tabs__icon-fallback"');
		expect(out).toContain('>A</span>');
		// f00099 audit: no inline onerror JavaScript.
		expect(out).not.toContain('onerror=');
		expect(out).not.toContain('this.replaceWith');
	});

	it('renders the badge as <span class="mcpv-tabs__badge">', () => {
		const out = renderTabs({
			tabs: [{ id: 'a', label: 'A', badge: '3' }],
		});
		expect(out).toContain('<span class="mcpv-tabs__badge">3</span>');
	});

	it('escapes HTML in tab labels and aria-label', () => {
		const out = renderTabs({
			tabs: [{ id: 'a', label: '<bad>&"\'' }],
			label: '"&<>',
		});
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		expect(out).toContain('aria-label="&quot;&amp;&lt;&gt;"');
	});

	it('emits the label inside a <span class="mcpv-tabs__label">', () => {
		const out = renderTabs({
			tabs: [{ id: 'a', label: 'A' }],
		});
		expect(out).toContain('<span class="mcpv-tabs__label">A</span>');
	});
});
