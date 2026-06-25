/**
 * _tabs-controller.ts — wires up every `[data-ui-tabs]` root in the
 * document: clicking a tab runs the cross-fade machinery, keeps
 * `aria-selected` in sync, and handles ← / → / Home / End for keyboard
 * navigation. Exported so it can be unit-tested.
 *
 * Cross-fade contract (f00069 S1):
 *   - On first paint (no `previousId`), the controller activates the
 *     default tab WITHOUT adding `.is-entering` (no animation — the
 *     user has nothing to fade out from).
 *   - On user-triggered swaps: the previous active panel gets
 *     `.is-leaving`; the new one gets `.is-entering`; both classes
 *     are removed and `hidden` is set on the outgoing panel on
 *     `animationend` (once).
 *   - `void next.offsetHeight` forces a reflow so rapid clicks
 *     restart the animation cleanly without flicker.
 *   - When `prefers-reduced-motion: reduce` is on, the CSS disables
 *     the animation, so `animationend` never fires; the fallback
 *     `setTimeout` cleans up classes + sets `hidden` regardless.
 *
 * The controller is idempotent: each root gets a one-shot
 * `data-tabs-bound` marker so a second call does nothing.
 */

const isButton = (n: EventTarget | null): n is HTMLButtonElement => {
	if (!n) return false;
	// Duck-type instead of `instanceof HTMLButtonElement` so the
	// controller stays runnable in bare-`node` test environments
	// where the DOM class globals don't exist (mirrors the
	// `initPluginTabs` contract).
	const tag = (n as { tagName?: unknown }).tagName;
	return typeof tag === 'string' && tag.toUpperCase() === 'BUTTON';
};

export const initTabs = (root: ParentNode): void => {
	const tabsRoots = root.querySelectorAll<HTMLElement>('[data-ui-tabs]');
	for (const tabsRoot of tabsRoots) {
		if (tabsRoot.dataset.tabsBound === '1') continue;
		tabsRoot.dataset.tabsBound = '1';
		bindOne(tabsRoot);
	}
};

const FADE_FALLBACK_MS = 260; // > animation duration (220 ms)

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

	/**
	 * Drive a real cross-fade: fade the previous panel out and the
	 * new panel in. On first paint (no `previousId`) the initial
	 * active panel appears with no animation. Under
	 * `prefers-reduced-motion: reduce`, the CSS disables the
	 * animation so `animationend` never fires — the fallback
	 * `setTimeout` cleans up classes and sets `hidden` regardless.
	 */
	const setActive = (id: string): void => {
		const previousId = root.dataset.active ?? '';
		const isFirstPaint = previousId === '';

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
			const wasActive = p.dataset.tabPanel === previousId;

			if (match) {
				// Make the panel visible so the fade-in animation runs.
				p.removeAttribute('hidden');
				// Drop any leftover classes from a previous swap.
				p.classList.remove('is-leaving');
				if (isFirstPaint) {
					// First paint: no previous panel to fade out,
					// so don't add `.is-entering` either — the user
					// sees the panel appear cleanly, no flicker.
					continue;
				}
				p.classList.add('is-entering');
				// Force reflow so a rapid second click restarts the
				// animation cleanly (offsetHeight is the canonical
				// reflow trigger; `void` discards the value).
				void p.offsetHeight;
				p.addEventListener(
					'animationend',
					() => {
						p.classList.remove('is-entering');
					},
					{ once: true },
				);
				// Fallback in case `animationend` doesn't fire
				// (e.g. reduced-motion: reduce disables the animation
				// in CSS, so `animationend` never dispatches).
				setTimeout(() => {
					p.classList.remove('is-entering');
				}, FADE_FALLBACK_MS);
			} else if (wasActive) {
				// Fade the outgoing panel out, then hide it.
				p.classList.remove('is-entering');
				p.classList.add('is-leaving');
				p.addEventListener(
					'animationend',
					() => {
						p.classList.remove('is-leaving');
						p.setAttribute('hidden', '');
					},
					{ once: true },
				);
				setTimeout(() => {
					p.classList.remove('is-leaving');
					p.setAttribute('hidden', '');
				}, FADE_FALLBACK_MS);
			} else {
				// Inactive + never active: keep hidden, drop any
				// stray transition classes (defensive).
				p.setAttribute('hidden', '');
				p.classList.remove('is-leaving');
				p.classList.remove('is-entering');
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
