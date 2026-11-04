/**
 * `initPluginTabs` — ARIA tabs controller used by `PluginTabs.astro`.
 *
 * Extracted from the component so the activation / keyboard logic is
 * unit-testable with jsdom instead of relying on a real browser
 * render. Pure over its inputs: callers pass the document to operate
 * on (defaults to the global `document`), so the same function works
 * in Astro SSR, in tests, and in any future server-rendered shell.
 *
 * Contract (mirrors `PluginTabs.astro`):
 * - The page must contain a single `<section data-plugin-tabs>` root.
 * - Each tab button has `data-tab-trigger="<id>"` and a matching panel
 *   `<section id="panel-<id>">`.
 * - `data-default-tab="<id>"` on the root selects the initial active tab;
 *   if absent or unknown, the first registered tab wins.
 *
 * Behaviour:
 * - Clicking a tab activates it.
 * - ArrowLeft / ArrowRight cycle through tabs (wrapping).
 * - Home / End jump to the first / last tab.
 * - Activation updates `aria-selected`, `tabindex`, and `hidden` on the
 *   matching panel; the previously active panel gets `hidden=""`.
 *
 * Idempotent: if the page has no `[data-plugin-tabs]` element, the
 * function returns `false` without touching the DOM.
 */

export interface IInitResult {
	/** True when a root was found and listeners were wired. */
	readonly wired: boolean;
	/** Number of tab panels discovered. */
	readonly panels: number;
}

/**
 * Wire up keyboard + click listeners on the tabs root. Pass an explicit
 * `doc` to test against a synthetic jsdom document; production callers
 * omit it.
 */
export const initPluginTabs = (doc: Document = document): IInitResult => {
	const root = doc.querySelector('[data-plugin-tabs]');
	// Duck-typing (`addEventListener` + `dataset` + `setAttribute`) keeps
	// the controller compatible with bare `node` test environments where
	// `HTMLElement` is not a global — and matches the narrow contract we
	// actually need from a tab root.
	if (
		!root ||
		typeof (root as HTMLElement).addEventListener !== 'function' ||
		typeof (root as HTMLElement).dataset !== 'object'
	) {
		return { wired: false, panels: 0 };
	}

	const defaultTab = (root as HTMLElement).dataset.defaultTab || '';
	const triggers = Array.from(doc.querySelectorAll('[data-tab-trigger]'));
	const panels = new Map<
		string,
		{ trigger: HTMLElement; panel: HTMLElement }
	>();
	for (const trigger of triggers) {
		if (typeof (trigger as HTMLElement).addEventListener !== 'function') {
			continue;
		}
		const id = (trigger as HTMLElement).dataset.tabTrigger || '';
		const panel = doc.getElementById(`panel-${id}`);
		// Triggers without a matching panel are left untouched on purpose:
		// they're a config error the caller should notice in the rendered
		// page (a button that does nothing) — silently mutating their a11y
		// attributes would mask the bug. The IInitResult.panels count is
		// the only signal we surface programmatically.
		if (!panel) continue;
		panels.set(id, {
			trigger: trigger as HTMLElement,
			panel: panel as HTMLElement,
		});
	}

	if (panels.size === 0) return { wired: true, panels: 0 };

	const activate = (id: string): void => {
		for (const [key, entry] of panels) {
			const active = key === id;
			entry.trigger.setAttribute(
				'aria-selected',
				active ? 'true' : 'false',
			);
			entry.trigger.setAttribute('tabindex', active ? '0' : '-1');
			if (active) entry.panel.removeAttribute('hidden');
			else entry.panel.setAttribute('hidden', '');
		}
	};

	const initial = panels.has(defaultTab)
		? defaultTab
		: (panels.keys().next().value ?? '');
	if (initial) activate(initial);

	for (const [id, entry] of panels) {
		entry.trigger.addEventListener('click', () => activate(id));
		entry.trigger.addEventListener('keydown', (event) => {
			const keys = Array.from(panels.keys());
			const idx = keys.indexOf(id);
			if (idx < 0) return;
			let nextIdx = -1;
			if (event.key === 'ArrowRight') nextIdx = (idx + 1) % keys.length;
			else if (event.key === 'ArrowLeft')
				nextIdx = (idx - 1 + keys.length) % keys.length;
			else if (event.key === 'Home') nextIdx = 0;
			else if (event.key === 'End') nextIdx = keys.length - 1;
			if (nextIdx < 0) return;
			event.preventDefault();
			const nextId = keys[nextIdx];
			if (nextId === undefined) return;
			const nextEntry = panels.get(nextId);
			if (!nextEntry) return;
			activate(nextId);
			nextEntry.trigger.focus();
		});
	}

	return { wired: true, panels: panels.size };
};
