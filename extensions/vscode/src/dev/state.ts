/**
 * `extensions/vscode/src/dev/state.ts` — typed, encapsulated store
 * for the dev entry's currently-active view. Anything that needs to
 * know the active view (so it can request a navigation back, so it
 * can soft-rerender when the user switches tabs) reads/writes it
 * through the `activeViewStore` singleton.
 *
 * Why a class (and not a top-level `let` in `entry.ts`)? The
 * `settings-panel.ts` module also needs to react to navigations
 * (e.g. after a successful install, the panel wants to know
 * whether the dashboard was the previous view so it can route
 * back to it). Module-level top-level `let`s in ESM behave like
 * module-private state but you can only mutate them from inside
 * that module; cross-module mutable state has to live somewhere
 * both modules can reach. The class keeps the mutation surface
 * narrow and the listener registry encapsulated — `entry.ts` and
 * `settings-panel.ts` never touch the underlying `current` field.
 */

export type ViewId = 'dashboard' | 'settings' | 'tool-detail' | 'metrics';

const ALL_VIEWS: ReadonlyArray<ViewId> = [
	'dashboard',
	'settings',
	'tool-detail',
	'metrics',
];

export class ActiveViewStore {
	#current: ViewId = 'dashboard';
	readonly #listeners = new Set<(id: ViewId) => void>();

	get current(): ViewId {
		return this.#current;
	}

	setCurrent(next: ViewId): void {
		if (this.#current === next) return;
		this.#current = next;
		for (const fn of this.#listeners) fn(next);
	}

	subscribe(listener: (id: ViewId) => void): () => void {
		this.#listeners.add(listener);
		return (): void => {
			this.#listeners.delete(listener);
		};
	}
}

const store = new ActiveViewStore();

export const getActiveView = (): ViewId => store.current;
export const setActiveView = (id: ViewId): void => {
	store.setCurrent(id);
};
export const onActiveViewChange = (
	listener: (id: ViewId) => void,
): (() => void) => store.subscribe(listener);

/**
 * Resolve the navigation default after a successful install.
 *
 *  - 'install-finished' (after wizard succeeds): if the user came
 *    from settings, go back to dashboard. If they came from the
 *    welcome screen, stay on settings / go to dashboard.
 *
 * The caller passes the previous ID; we return what to navigate to.
 */
export const resolvePostInstallTarget = (previousView: ViewId): ViewId => {
	if (previousView === 'settings') return 'dashboard';
	return 'dashboard';
};

export const knownViewIds = (): ReadonlyArray<ViewId> => ALL_VIEWS;

export const isViewId = (value: string): value is ViewId =>
	(ALL_VIEWS as ReadonlyArray<string>).includes(value);
