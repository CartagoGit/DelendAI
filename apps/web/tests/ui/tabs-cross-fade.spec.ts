/**
 * `initTabs` cross-fade contract guard (f00069 S1).
 *
 * Mirrors the style of `apps/web/scripts/__tests__/plugin-tabs-controller.spec.ts`:
 * vitest runs in `node` here (per `apps/web/vitest.config.ts`), so we ship
 * a tiny purpose-built DOM stand-in instead of pulling in `jsdom` /
 * `happy-dom`. The stand-in implements the slice of the DOM API `initTabs`
 * actually consumes (attribute mutation, classList, addEventListener with
 * `{ once: true }`, the `animationend` event, `dataset`, `offsetHeight`,
 * `matchMedia`).
 *
 * Why not jsdom: l110 §2 deliberately avoided new dependencies. A 60-line
 * fake keeps the test fast, dependency-free, and forces us to write the
 * controller against the narrowest DOM contract — if the fake rejects
 * something the controller asks for, that's a signal the controller is
 * overreaching.
 *
 * Covered (matches the S1 acceptance list):
 *   (a) clicking a tab toggles `.is-leaving` on the previous panel and
 *       `.is-entering` on the new one
 *   (b) `prefers-reduced-motion: reduce` short-circuits the animation
 *   (c) keyboard arrow keys still work
 *   (d) the `plugin` variant renders the same DOM shape as the deleted
 *       `PluginTabs.astro` (verified statically against Tabs.astro)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { initTabs } from '../../src/components/ui/_tabs-controller';

// ─── Minimal DOM stand-in ────────────────────────────────────────────────────

interface FakeClassList {
	add: (...names: string[]) => void;
	remove: (...names: string[]) => void;
	contains: (name: string) => boolean;
}

type FakeListener = (event: {
	key?: string;
	preventDefault: () => void;
}) => void;

/**
 * Purpose-built DOM fake used by every test in this file. We declare
 * only the slice of the DOM API the controller actually consumes
 * (`querySelector(All)`, `getAttribute`/`setAttribute`, `hasAttribute`,
 * `addEventListener`, `classList.{add,remove,contains}`, `dataset`,
 * `offsetHeight`, `focus`). All method bodies are plain functions
 * assigned after construction; the return is cast through `unknown` so
 * the controller's duck-typed reads type-check (this mirrors the pattern
 * in `plugin-tabs-controller.spec.ts`).
 */
type FakeElement = {
	readonly tagName: string;
	readonly id?: string;
	dataset: Record<string, string>;
	attrs: Map<string, string>;
	classes: Set<string>;
	classList: FakeClassList;
	children: FakeElement[];
	listeners: Map<string, FakeListener[]>;
	focused: number;
	offsetHeightReads: number;
	hiddenAttr: boolean;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	hasAttribute(name: string): boolean;
	toggleAttribute(name: string, force?: boolean): void;
	getAttribute(name: string): string | null;
	addEventListener(
		type: string,
		fn: FakeListener,
		opts?: { once?: boolean },
	): void;
	querySelector(selector: string): FakeElement | null;
	querySelectorAll(selector: string): FakeElement[];
	focus(): void;
};

const makeEl = (
	tagName: string,
	init: {
		id?: string;
		dataset?: Record<string, string>;
		hidden?: boolean;
		children?: FakeElement[];
	} = {},
): FakeElement => {
	const attrs = new Map<string, string>();
	if (init.hidden) attrs.set('hidden', '');
	const classes = new Set<string>();
	const classList: FakeClassList = {
		add: (...names) => {
			for (const n of names) classes.add(n);
		},
		remove: (...names) => {
			for (const n of names) classes.delete(n);
		},
		contains: (name) => classes.has(name),
	};
	const listeners = new Map<string, FakeListener[]>();
	const fakeNode = {
		tagName: tagName.toUpperCase(),
		id: init.id,
		dataset: { ...(init.dataset ?? {}) },
		attrs,
		classes,
		classList,
		children: init.children ?? [],
		listeners,
		focused: 0,
		offsetHeightReads: 0,
		hiddenAttr: !!init.hidden,
	};
	const el = fakeNode as unknown as FakeElement & {
		offsetHeight: number;
	};
	el.setAttribute = (name: string, value: string): void => {
		attrs.set(name, value);
		if (name === 'hidden') fakeNode.hiddenAttr = true;
	};
	el.removeAttribute = (name: string): void => {
		attrs.delete(name);
		if (name === 'hidden') fakeNode.hiddenAttr = false;
	};
	el.hasAttribute = (name: string): boolean => attrs.has(name);
	el.toggleAttribute = (name: string, force?: boolean): void => {
		const has = attrs.has(name);
		const on = force === undefined ? !has : force;
		if (on) attrs.set(name, '');
		else attrs.delete(name);
		if (name === 'hidden') fakeNode.hiddenAttr = on;
	};
	el.getAttribute = (name: string): string | null =>
		attrs.has(name) ? (attrs.get(name) as string) : null;
	el.addEventListener = (
		type: string,
		fn: FakeListener,
		_opts?: { once?: boolean },
	): void => {
		const list = listeners.get(type) ?? [];
		list.push(fn);
		listeners.set(type, list);
	};
	el.querySelector = (selector: string): FakeElement | null =>
		walk(el, selector);
	el.querySelectorAll = (selector: string): FakeElement[] => {
		const out: FakeElement[] = [];
		const walkAll = (n: FakeElement): void => {
			if (matches(n, selector)) out.push(n);
			for (const c of n.children) walkAll(c);
		};
		walkAll(el);
		return out;
	};
	el.focus = (): void => {
		fakeNode.focused += 1;
	};
	Object.defineProperty(el, 'offsetHeight', {
		get() {
			fakeNode.offsetHeightReads += 1;
			return 0;
		},
	});
	return el;
};

const matches = (el: FakeElement, selector: string): boolean => {
	if (selector.startsWith('[')) {
		const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
		if (!m) return false;
		const [, attr, value] = m;
		if (attr.startsWith('data-')) {
			const key = attr
				.slice('data-'.length)
				.replace(/-([a-z])/g, (_, c) => String(c).toUpperCase());
			if (!(key in el.dataset)) return false;
			if (value === undefined) return true;
			return el.dataset[key] === value;
		}
		if (value === undefined) return el.attrs.has(attr);
		return el.attrs.get(attr) === value;
	}
	return el.tagName.toLowerCase() === selector;
};

const walk = (el: FakeElement, selector: string): FakeElement | null => {
	if (matches(el, selector)) return el;
	for (const child of el.children) {
		const hit = walk(child, selector);
		if (hit) return hit;
	}
	return null;
};

const fakeDocument = (root: FakeElement) => ({
	documentElement: root,
	querySelector: (s: string) => walk(root, s),
	querySelectorAll: (s: string) => {
		const out: FakeElement[] = [];
		const w = (e: FakeElement): void => {
			if (matches(e, s)) out.push(e);
			for (const c of e.children) w(c);
		};
		w(root);
		return out;
	},
});

// ─── DOM builder helpers ─────────────────────────────────────────────────────

const buildTabsDom = (
	tabs: ReadonlyArray<{ id: string; label: string }>,
	defaultTab?: string,
	initialHidden: ReadonlyArray<string> = [],
): FakeElement => {
	const triggers = tabs.map((t) =>
		makeEl('BUTTON', {
			id: `ui-tab-${t.id}`,
			dataset: { tabTrigger: t.id },
		}),
	);
	const panels = tabs.map((t) =>
		makeEl('SECTION', {
			id: `ui-panel-${t.id}`,
			dataset: { tabPanel: t.id },
			hidden: initialHidden.includes(t.id) ? false : true,
		}),
	);
	return makeEl('SECTION', {
		id: 'ui-tabs',
		dataset: {
			uiTabs: '',
			defaultTab: defaultTab ?? tabs[0]?.id ?? '',
		},
		children: [...triggers, ...panels],
	});
};

const fire = (
	el: FakeElement,
	event: 'click' | 'keydown' | 'animationend',
	payload: { key?: string } = {},
): void => {
	for (const listener of el.listeners.get(event) ?? []) {
		listener({
			...payload,
			preventDefault: () => {},
		});
	}
};

const panelById = (root: FakeElement, id: string): FakeElement => {
	const all = root.querySelectorAll('[data-tab-panel]');
	const hit = all.find((p) => p.dataset.tabPanel === id);
	if (!hit) throw new Error(`panel ${id} not found`);
	return hit;
};

const triggerById = (root: FakeElement, id: string): FakeElement => {
	const all = root.querySelectorAll('[data-tab-trigger]');
	const hit = all.find((p) => p.dataset.tabTrigger === id);
	if (!hit) throw new Error(`trigger ${id} not found`);
	return hit;
};

// ─── Per-test cleanup (fake timers + leftover DOM globals) ──────────────────
//
// The controller no longer reads `window.matchMedia` — the
// prefers-reduced-motion contract is enforced by the CSS rule in
// Tabs.astro, with the fallback setTimeout cleaning up classes when
// `animationend` never fires. So we don't need to stub `globalThis.window`
// here; we only need to make sure fake timers don't leak across tests.

afterEach(() => {
	vi.useRealTimers();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('initTabs — cross-fade (f00069 S1)', () => {
	it('activates the first tab on first paint with no transition classes', () => {
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
		]);
		initTabs(fakeDocument(root) as unknown as ParentNode);

		const installPanel = panelById(root, 'install');
		expect(installPanel.classList.contains('is-entering')).toBe(false);
		expect(installPanel.classList.contains('is-leaving')).toBe(false);
		expect(installPanel.hasAttribute('hidden')).toBe(false);

		const toolsPanel = panelById(root, 'tools');
		expect(toolsPanel.hasAttribute('hidden')).toBe(true);
	});

	it('(a) clicking a tab adds `.is-leaving` to the previous panel and `.is-entering` to the new one', () => {
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
		]);
		initTabs(fakeDocument(root) as unknown as ParentNode);

		const toolsTrigger = triggerById(root, 'tools');
		fire(toolsTrigger, 'click');

		const toolsPanel = panelById(root, 'tools');
		expect(toolsPanel.classList.contains('is-entering')).toBe(true);
		expect(toolsPanel.hasAttribute('hidden')).toBe(false);

		const installPanel = panelById(root, 'install');
		expect(installPanel.classList.contains('is-leaving')).toBe(true);
		// Outgoing panel keeps `hidden` off until `animationend` fires.
		expect(installPanel.hasAttribute('hidden')).toBe(false);

		// After `animationend`, the outgoing panel hides; the entering
		// panel drops its transition class (resting state is clean).
		fire(installPanel, 'animationend');
		fire(toolsPanel, 'animationend');
		expect(installPanel.hasAttribute('hidden')).toBe(true);
		expect(toolsPanel.classList.contains('is-entering')).toBe(false);
		expect(toolsPanel.classList.contains('is-leaving')).toBe(false);
	});

	it('forces a reflow on the entering panel (offsetHeight read) so rapid clicks restart cleanly', () => {
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
		]);
		initTabs(fakeDocument(root) as unknown as ParentNode);

		const toolsPanel = panelById(root, 'tools');
		expect(toolsPanel.offsetHeightReads).toBe(0);

		fire(triggerById(root, 'tools'), 'click');
		expect(toolsPanel.offsetHeightReads).toBeGreaterThan(0);
	});

	it('(b) reduced-motion: the fallback timeout cleans up classes + hides the outgoing panel even when animationend never fires', () => {
		// Under prefers-reduced-motion: reduce, the CSS rule in
		// Tabs.astro disables the keyframes so `animationend` never
		// dispatches. The controller still wires a `setTimeout(260ms)`
		// fallback that cleans up the transition classes and sets
		// `hidden` on the outgoing panel — otherwise the
		// `.is-leaving` class would stick forever. We simulate that
		// by advancing fake timers.
		vi.useFakeTimers();
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
		]);
		initTabs(fakeDocument(root) as unknown as ParentNode);

		fire(triggerById(root, 'tools'), 'click');

		const toolsPanel = panelById(root, 'tools');
		const installPanel = panelById(root, 'install');

		// Immediately after the click the transition classes are
		// present (the controller is identical regardless of the
		// media query — the CSS rule makes them invisible to the user
		// and `animationend` is what cleans them up under normal
		// motion). With `animationend` suppressed, only the fallback
		// timer removes them.
		expect(toolsPanel.classList.contains('is-entering')).toBe(true);

		// Advance past the fallback window (260 ms) and verify the
		// resting state matches the normal-motion path.
		vi.advanceTimersByTime(300);

		expect(toolsPanel.classList.contains('is-entering')).toBe(false);
		expect(toolsPanel.classList.contains('is-leaving')).toBe(false);
		expect(installPanel.classList.contains('is-entering')).toBe(false);
		expect(installPanel.classList.contains('is-leaving')).toBe(false);
		expect(installPanel.hasAttribute('hidden')).toBe(true);
		expect(toolsPanel.hasAttribute('hidden')).toBe(false);
	});

	it('(c) arrow keys still move activation (keyboard contract preserved)', () => {
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
			{ id: 'config', label: 'Config' },
		]);
		initTabs(fakeDocument(root) as unknown as ParentNode);

		const installTrigger = triggerById(root, 'install');
		const toolsTrigger = triggerById(root, 'tools');
		const configTrigger = triggerById(root, 'config');

		// ArrowRight from `install` → `tools`, focus moves, panel activates.
		fire(installTrigger, 'keydown', { key: 'ArrowRight' });
		expect(toolsTrigger.focused).toBe(1);
		expect(root.dataset.active).toBe('tools');

		// ArrowRight again → `config`.
		fire(toolsTrigger, 'keydown', { key: 'ArrowRight' });
		expect(configTrigger.focused).toBe(1);
		expect(root.dataset.active).toBe('config');

		// ArrowRight wraps → back to `install`.
		fire(configTrigger, 'keydown', { key: 'ArrowRight' });
		expect(installTrigger.focused).toBe(1);
		expect(root.dataset.active).toBe('install');

		// ArrowLeft wraps from `install` → `config`.
		fire(installTrigger, 'keydown', { key: 'ArrowLeft' });
		expect(configTrigger.focused).toBe(2);
		expect(root.dataset.active).toBe('config');

		// Home jumps to first, End jumps to last.
		fire(configTrigger, 'keydown', { key: 'Home' });
		expect(installTrigger.focused).toBe(2);
		expect(root.dataset.active).toBe('install');
		fire(installTrigger, 'keydown', { key: 'End' });
		expect(configTrigger.focused).toBe(3);
		expect(root.dataset.active).toBe('config');
	});

	it('honours data-default-tab when it differs from the first tab', () => {
		const root = buildTabsDom(
			[
				{ id: 'install', label: 'Install' },
				{ id: 'tools', label: 'Tools' },
			],
			'tools',
		);
		initTabs(fakeDocument(root) as unknown as ParentNode);
		expect(root.dataset.active).toBe('tools');
		const toolsPanel = panelById(root, 'tools');
		expect(toolsPanel.hasAttribute('hidden')).toBe(false);
		const installPanel = panelById(root, 'install');
		expect(installPanel.hasAttribute('hidden')).toBe(true);
	});

	it('is idempotent — a second `initTabs` does not re-wire the root', () => {
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
		]);
		const doc = fakeDocument(root) as unknown as ParentNode;
		initTabs(doc);
		initTabs(doc);
		expect(root.dataset.tabsBound).toBe('1');
	});
});

// ─── Static DOM-shape check for the `plugin` variant (case (d)) ──────────────
//
// We can't render Astro components in the `node` vitest environment, so we
// verify the contract by reading the component source. The proposal promises
// that the `plugin` variant reproduces the deleted `PluginTabs.astro` look:
// rounded tab, `border-bottom: 2px solid currentColor`, padding
// `0.5rem 0.9rem`, active label `font-weight: 600`. This test fails if any
// of those values regress.

describe('Tabs.astro — plugin variant DOM shape', () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const tabsAstroPath = resolve(here, '../../src/components/ui/Tabs.astro');
	const source = readFileSync(tabsAstroPath, 'utf8');

	it('declares the `plugin` variant in the union', () => {
		expect(source).toMatch(/variant\?: 'underline' \| 'pill' \| 'plugin'/);
	});

	it('renders a `<button class="ui-tabs__tab">` per entry', () => {
		expect(source).toContain('class="ui-tabs__tab"');
		expect(source).toContain('data-tab-trigger={t.id}');
	});

	it('emits `.ui-tabs--plugin` selector with the deleted PluginTabs look', () => {
		expect(source).toContain('.ui-tabs--plugin .ui-tabs__tab');
		expect(source).toContain('padding: 0.5rem 0.9rem');
		expect(source).toContain('border-bottom: 2px solid currentColor');
		// Active label gets 600 weight in the plugin variant.
		expect(source).toMatch(
			/\.ui-tabs--plugin \.ui-tabs__tab\[aria-selected='true'\][\s\S]{0,200}font-weight: 600/,
		);
	});

	it('defines both `is-entering` and `is-leaving` panel classes for the cross-fade', () => {
		expect(source).toContain('[data-tab-panel].is-entering');
		expect(source).toContain('[data-tab-panel].is-leaving');
		// 220 ms with cubic-bezier(0.2, 0.7, 0.2, 1) is the explicit S1 contract.
		expect(source).toContain('220ms cubic-bezier(0.2, 0.7, 0.2, 1)');
		expect(source).toContain('@keyframes ui-tab-fade-in');
		expect(source).toContain('@keyframes ui-tab-fade-out');
	});

	it('disables the cross-fade under prefers-reduced-motion', () => {
		expect(source).toMatch(
			/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,400}animation: none/,
		);
	});

	it('renders the optional icon before the label when `t.icon` is set', () => {
		expect(source).toContain('t.icon &&');
		expect(source).toContain('class="ui-tabs__icon"');
		expect(source).toMatch(/<img[\s\S]{0,200}class="ui-tabs__icon"/);
	});
});
