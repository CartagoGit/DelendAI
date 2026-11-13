// @ts-nocheck -- hand-rolled DOM stand-in (no jsdom in this project); it
// implements only the slice of the DOM `initTabs` reads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initTabs } from './_tabs-controller';

type Fn = (e?: unknown) => void;

const makeNode = (dataset: Record<string, string>) => {
	const listeners = new Map<string, Fn[]>();
	const classes = new Set<string>();
	const attrs = new Map<string, string>();
	return {
		tagName: 'BUTTON',
		dataset,
		tabIndex: 0,
		offsetHeight: 0,
		classList: {
			add: (c: string) => void classes.add(c),
			remove: (c: string) => void classes.delete(c),
			has: (c: string) => classes.has(c),
		},
		setAttribute: (k: string, v: string) => void attrs.set(k, v),
		removeAttribute: (k: string) => void attrs.delete(k),
		hasAttribute: (k: string) => attrs.has(k),
		addEventListener: (t: string, fn: Fn) =>
			void listeners.set(t, [...(listeners.get(t) ?? []), fn]),
		removeEventListener: (t: string, fn: Fn) =>
			void listeners.set(
				t,
				(listeners.get(t) ?? []).filter((f) => f !== fn),
			),
		focus: () => undefined,
		fire: (t: string, e: unknown = {}) => {
			for (const fn of listeners.get(t) ?? []) fn(e);
		},
	};
};

const build = () => {
	const triggers = ['a', 'b'].map((id) => makeNode({ tabTrigger: id }));
	const panels = ['a', 'b'].map((id) => makeNode({ tabPanel: id }));
	const root = {
		...makeNode({ defaultTab: 'a' }),
		querySelectorAll: (sel: string) =>
			sel === '[data-tab-trigger]' ? triggers : panels,
	};
	const doc = {
		querySelectorAll: (sel: string) =>
			sel === '[data-ui-tabs]' ? [root] : [],
	};
	return { doc, root, triggers, panels };
};

describe('initTabs', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('binds a root once and a fresh root after navigation', () => {
		const first = build();
		initTabs(first.doc);
		initTabs(first.doc);
		expect(first.triggers[0]?.dataset.tabTrigger).toBe('a');
		expect(first.root.dataset.tabsBound).toBe('1');
		const next = build();
		initTabs(next.doc);
		expect(next.root.dataset.tabsBound).toBe('1');
		next.triggers[1]?.fire('click');
		expect(next.root.dataset.active).toBe('b');
	});

	it('a stale fade callback never hides the panel that became active again', () => {
		const { doc, triggers, panels } = build();
		initTabs(doc);
		triggers[1]?.fire('click'); // a leaves
		triggers[0]?.fire('click'); // a returns before the fade ends
		vi.advanceTimersByTime(1000);
		expect(panels[0]?.hasAttribute('hidden')).toBe(false);
		expect(panels[1]?.hasAttribute('hidden')).toBe(true);
	});
});
