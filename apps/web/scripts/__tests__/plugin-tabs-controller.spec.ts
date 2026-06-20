/**
 * `initPluginTabs` contract guard (p110 s8).
 *
 * The plugin tabs controller touches the DOM (querySelector, getElementById,
 * addEventListener, attribute mutations, focus). Vitest runs in `node`
 * here (per `apps/web/vitest.config.ts`), so we ship a tiny purpose-built
 * DOM stand-in instead of pulling in `jsdom` / `happy-dom`. The stand-in
 * implements the slice of the DOM API `initPluginTabs` actually consumes.
 *
 * Why not jsdom: p110 §2 deliberately avoided new dependencies. A 50-line
 * fake keeps the test fast, dependency-free, and forces us to write the
 * controller against the narrowest DOM contract — if the fake rejects
 * something the controller asks for, that's a signal the controller is
 * overreaching.
 */
import { describe, expect, it } from 'vitest';

import { initPluginTabs } from '../lib/plugin-tabs-controller';

// ─── Minimal DOM stand-in ────────────────────────────────────────────────────

type AttrMap = Map<string, string>;
type Listener = (event: { key?: string; preventDefault: () => void }) => void;

interface FakeElement {
	readonly tagName: string;
	readonly id?: string;
	readonly dataset: Record<string, string>;
	attrs: AttrMap;
	children: FakeElement[];
	bySelector: Map<string, FakeElement[]>;
	listeners: Map<string, Listener[]>;
	focused: number;
}

const makeEl = (
	tagName: string,
	init: Partial<FakeElement> = {},
): FakeElement => {
	const attrs: AttrMap = new Map();
	for (const [k, v] of Object.entries(init.attrs ?? {})) attrs.set(k, v);
	const listeners: Map<string, Listener[]> = new Map();
	// The real DOM's addEventListener stores callbacks; we mirror that
	// so the controller's duck-type check (`typeof .addEventListener ===
	// 'function'`) passes.
	const fakeNode = {
		tagName: tagName.toUpperCase(),
		id: init.id,
		dataset: { ...(init.dataset ?? {}) },
		attrs,
		children: init.children ?? [],
		bySelector: new Map(),
		listeners,
		focused: 0,
		addEventListener(type: string, fn: Listener): void {
			const list = listeners.get(type) ?? [];
			list.push(fn);
			listeners.set(type, list);
		},
		setAttribute(name: string, value: string): void {
			attrs.set(name, value);
		},
		removeAttribute(name: string): void {
			attrs.delete(name);
		},
		focus(): void {
			fakeNode.focused += 1;
		},
	};
	return fakeNode as unknown as FakeElement;
};

const matches = (el: FakeElement, selector: string): boolean => {
	if (selector.startsWith('[')) {
		// attribute selector: [name="value"] or [data-foo].
		const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
		if (!m) return false;
		const [, attr, value] = m;
		// Mirror the real DOM: `[data-plugin-tabs]` matches any element
		// that has the corresponding `dataset` key, with or without a
		// value. The tests construct elements by populating `dataset`,
		// not by writing the raw `data-*` attribute.
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

const fakeDocument = (root: FakeElement | null) => {
	const querySelector = (selector: string): FakeElement | null => {
		const walk = (el: FakeElement | null): FakeElement | null => {
			if (!el) return null;
			if (matches(el, selector)) return el;
			for (const child of el.children) {
				const hit = walk(child);
				if (hit) return hit;
			}
			return null;
		};
		return walk(root);
	};
	const querySelectorAll = (selector: string): FakeElement[] => {
		const out: FakeElement[] = [];
		const walk = (el: FakeElement | null): void => {
			if (!el) return;
			if (matches(el, selector)) out.push(el);
			for (const child of el.children) walk(child);
		};
		walk(root);
		return out;
	};
	const getElementById = (id: string): FakeElement | null => {
		const walk = (el: FakeElement | null): FakeElement | null => {
			if (!el) return null;
			if (el.id === id) return el;
			for (const child of el.children) {
				const hit = walk(child);
				if (hit) return hit;
			}
			return null;
		};
		return walk(root);
	};
	return {
		querySelector,
		querySelectorAll,
		getElementById,
	} as unknown as Document;
};

// ─── DOM builder helpers ─────────────────────────────────────────────────────

const buildTabsDom = (
	tabs: ReadonlyArray<{ id: string; label: string }>,
	defaultTab?: string,
): FakeElement => {
	const triggers = tabs.map((t) =>
		makeEl('BUTTON', {
			id: `tab-${t.id}`,
			dataset: { tabTrigger: t.id },
		}),
	);
	const panels = tabs.map((t) =>
		makeEl('SECTION', {
			id: `panel-${t.id}`,
		}),
	);
	return makeEl('SECTION', {
		id: 'plugin-tabs',
		dataset: {
			pluginTabs: '',
			defaultTab: defaultTab ?? tabs[0]?.id ?? '',
		},
		children: [...triggers, ...panels],
	}) as unknown as FakeElement;
};

const fire = (
	el: FakeElement,
	event: 'click' | 'keydown',
	payload: { key?: string } = {},
): void => {
	for (const listener of el.listeners.get(event) ?? []) {
		listener({
			...payload,
			preventDefault: () => {},
		});
	}
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('initPluginTabs', () => {
	it('returns wired=false when no [data-plugin-tabs] root is present', () => {
		const doc = fakeDocument(null);
		const out = initPluginTabs(doc);
		expect(out).toEqual({ wired: false, panels: 0 });
	});

	it('activates the first tab when no data-default-tab is set', () => {
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
		]);
		const doc = fakeDocument(root);
		const out = initPluginTabs(doc);
		expect(out).toEqual({ wired: true, panels: 2 });

		const installTrigger = (root.children[0] as FakeElement).attrs;
		expect(installTrigger.get('aria-selected')).toBe('true');
		expect(installTrigger.get('tabindex')).toBe('0');
		const toolsTrigger = (root.children[1] as FakeElement).attrs;
		expect(toolsTrigger.get('aria-selected')).toBe('false');
		expect(toolsTrigger.get('tabindex')).toBe('-1');

		const installPanel = (root.children[2] as FakeElement).attrs;
		expect(installPanel.has('hidden')).toBe(false);
		const toolsPanel = (root.children[3] as FakeElement).attrs;
		expect(toolsPanel.get('hidden')).toBe('');
	});

	it('activates the explicit data-default-tab when present', () => {
		const root = buildTabsDom(
			[
				{ id: 'install', label: 'Install' },
				{ id: 'tools', label: 'Tools' },
			],
			'tools',
		);
		initPluginTabs(fakeDocument(root));
		const installTrigger = (root.children[0] as FakeElement).attrs;
		const toolsTrigger = (root.children[1] as FakeElement).attrs;
		expect(installTrigger.get('aria-selected')).toBe('false');
		expect(toolsTrigger.get('aria-selected')).toBe('true');
	});

	it('switches panels on click', () => {
		const root = buildTabsDom([
			{ id: 'install', label: 'Install' },
			{ id: 'tools', label: 'Tools' },
		]);
		initPluginTabs(fakeDocument(root));

		fire(root.children[1] as FakeElement, 'click');

		const installTrigger = (root.children[0] as FakeElement).attrs;
		const toolsTrigger = (root.children[1] as FakeElement).attrs;
		expect(installTrigger.get('aria-selected')).toBe('false');
		expect(toolsTrigger.get('aria-selected')).toBe('true');
		const installPanel = (root.children[2] as FakeElement).attrs;
		expect(installPanel.get('hidden')).toBe('');
	});

	it('cycles with ArrowRight (wrap-around)', () => {
		const root = buildTabsDom([
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
			{ id: 'c', label: 'C' },
		]);
		initPluginTabs(fakeDocument(root));

		// From `a` → ArrowRight → `b`
		fire(root.children[0] as FakeElement, 'keydown', { key: 'ArrowRight' });
		expect(
			(root.children[1] as FakeElement).attrs.get('aria-selected'),
		).toBe('true');

		// From `b` → ArrowRight → `c`
		fire(root.children[1] as FakeElement, 'keydown', { key: 'ArrowRight' });
		expect(
			(root.children[2] as FakeElement).attrs.get('aria-selected'),
		).toBe('true');

		// From `c` → ArrowRight → wrap to `a`
		fire(root.children[2] as FakeElement, 'keydown', { key: 'ArrowRight' });
		expect(
			(root.children[0] as FakeElement).attrs.get('aria-selected'),
		).toBe('true');
	});

	it('cycles with ArrowLeft (wrap-around)', () => {
		const root = buildTabsDom([
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
		]);
		initPluginTabs(fakeDocument(root));

		// From `a` → ArrowLeft → wrap to `b`
		fire(root.children[0] as FakeElement, 'keydown', { key: 'ArrowLeft' });
		expect(
			(root.children[1] as FakeElement).attrs.get('aria-selected'),
		).toBe('true');
	});

	it('jumps to the first tab with Home and to the last with End', () => {
		const root = buildTabsDom([
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
			{ id: 'c', label: 'C' },
		]);
		initPluginTabs(fakeDocument(root));

		fire(root.children[2] as FakeElement, 'keydown', { key: 'Home' });
		expect(
			(root.children[0] as FakeElement).attrs.get('aria-selected'),
		).toBe('true');

		fire(root.children[0] as FakeElement, 'keydown', { key: 'End' });
		expect(
			(root.children[2] as FakeElement).attrs.get('aria-selected'),
		).toBe('true');
	});

	it('ignores keys that are not navigation keys', () => {
		const root = buildTabsDom([
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
		]);
		initPluginTabs(fakeDocument(root));

		fire(root.children[0] as FakeElement, 'keydown', { key: 'Enter' });
		fire(root.children[0] as FakeElement, 'keydown', { key: ' ' });
		// Initial selection preserved.
		expect(
			(root.children[0] as FakeElement).attrs.get('aria-selected'),
		).toBe('true');
	});

	it('skips trigger buttons whose panel id is missing from the DOM', () => {
		const triggerA = makeEl('BUTTON', {
			id: 'tab-a',
			dataset: { tabTrigger: 'a' },
		});
		const triggerB = makeEl('BUTTON', {
			id: 'tab-b',
			dataset: { tabTrigger: 'b' },
		});
		const panelA = makeEl('SECTION', { id: 'panel-a' });
		// Only panel-a exists; panel-b is missing — the controller
		// must skip triggerB and not activate it. We assert by snapshot:
		// before init both triggers have empty attribute maps; after
		// init, only triggerA's aria-selected is set (triggerB remains
		// untouched because its panel is missing).
		expect(triggerA.attrs.size).toBe(0);
		expect(triggerB.attrs.size).toBe(0);
		const root = makeEl('SECTION', {
			id: 'plugin-tabs',
			dataset: { pluginTabs: '', defaultTab: 'a' },
			children: [triggerA, triggerB, panelA],
		});
		initPluginTabs(fakeDocument(root));
		// After init: triggerA is selected, triggerB never wired.
		expect(triggerA.attrs.get('aria-selected')).toBe('true');
		expect(triggerB.attrs.get('aria-selected')).toBeUndefined();
		expect(triggerB.attrs.has('tabindex')).toBe(false);
	});
});
