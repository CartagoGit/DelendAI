/**
 * _tabs-controller.ts — wires up every `[data-ui-tabs]` root in the
 * document: clicking a tab toggles the `hidden` attribute on its panel,
 * keeps `aria-selected` in sync, and handles ← / → / Home / End for
 * keyboard navigation. Exported so it can be unit-tested.
 *
 * The controller is idempotent: each root gets a one-shot `data-tabs-bound`
 * marker so a second call does nothing.
 */

const isButton = (n: unknown): n is HTMLButtonElement =>
	n instanceof HTMLButtonElement;

export const initTabs = (root: ParentNode): void => {
	const tabsRoots = root.querySelectorAll<HTMLElement>('[data-ui-tabs]');
	for (const tabsRoot of tabsRoots) {
		if (tabsRoot.dataset.tabsBound === '1') continue;
		tabsRoot.dataset.tabsBound = '1';
		bindOne(tabsRoot);
	}
};

const bindOne = (root: HTMLElement): void => {
	const triggers = Array.from(
		root.querySelectorAll<HTMLButtonElement>('[data-tab-trigger]'),
	);
	if (triggers.length === 0) return;

	const idToTrigger = new Map<string, HTMLButtonElement>();
	for (const t of triggers) {
		const id = t.dataset.tabTrigger;
		if (id) idToTrigger.set(id, t);
	}

	const setActive = (id: string): void => {
		root.dataset.active = id;
		for (const t of triggers) {
			const on = t.dataset.tabTrigger === id;
			t.setAttribute('aria-selected', String(on));
			t.tabIndex = on ? 0 : -1;
		}
		for (const p of root.querySelectorAll<HTMLElement>(
			'[data-tab-panel]',
		)) {
			const match = p.dataset.tabPanel === id;
			p.toggleAttribute('hidden', !match);
			// Restart the fade-in animation on the freshly-revealed panel.
			if (match) {
				p.style.animation = 'none';
				// Force reflow so the animation restarts cleanly.
				void p.offsetHeight;
				p.style.animation = '';
			}
		}
	};

	for (const t of triggers) {
		t.addEventListener('click', () => {
			const id = t.dataset.tabTrigger;
			if (id) setActive(id);
		});
		t.addEventListener('keydown', (ev) => {
			if (!isButton(t)) return;
			const key = ev.key;
			const idx = triggers.indexOf(t);
			let next = idx;
			if (key === 'ArrowRight') next = (idx + 1) % triggers.length;
			else if (key === 'ArrowLeft')
				next = (idx - 1 + triggers.length) % triggers.length;
			else if (key === 'Home') next = 0;
			else if (key === 'End') next = triggers.length - 1;
			else return;
			ev.preventDefault();
			const target = triggers[next];
			if (target) {
				target.focus();
				const id = target.dataset.tabTrigger;
				if (id) setActive(id);
			}
		});
	}

	// Honour the SSR default if it differs from the first tab.
	const initial = root.dataset.defaultTab ?? triggers[0]?.dataset.tabTrigger;
	if (initial && idToTrigger.has(initial)) setActive(initial);
};
