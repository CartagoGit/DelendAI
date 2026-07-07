/**
 * `extensions/vscode/src/dev/state.ts` — tiny shared-state module for
 * the dev entry. Anything that needs to know the currently-active
 * view (so it can request a navigation back) reads/writes it here.
 *
 * Why not just a top-level `let` in `entry.ts`? Because `settings-panel.ts`
 * also needs to react to navigations (e.g. after a successful install
 * the panel wants to know whether the dashboard was the previous
 * view so it can route back to it). Module-level top-level lets in
 * ESM behave like module-private state but you can only mutate them
 * from inside that module; cross-module mutable state has to live
 * somewhere both modules can reach. This file is that somewhere.
 */

export type ViewId = 'dashboard' | 'settings' | 'tool-detail' | 'metrics';

let current: ViewId = 'dashboard';

const listeners = new Set<(id: ViewId) => void>();

export const getActiveView = (): ViewId => current;

export const setActiveView = (id: ViewId): void => {
	if (current === id) return;
	current = id;
	for (const fn of listeners) fn(id);
};

export const onActiveViewChange = (fn: (id: ViewId) => void): (() => void) => {
	listeners.add(fn);
	return (): void => {
		listeners.delete(fn);
	};
};

/**
 * Resolve the navigation default for a given entry point.
 *
 *  - 'dashboard' first paint: if the workspace is configured, render
 *    the dashboard directly. If not, route to the welcome screen
 *    (handled inside `entry.ts` — `state.ts` only knows the ID).
 *  - 'install-finished' (after wizard succeeds): if the user came
 *    from the dashboard, go back to it. If they came from the welcome
 *    screen, stay on settings / go to dashboard.
 *
 * The caller passes the previous ID; we return what to navigate to.
 */
export const resolvePostInstallTarget = (previousView: ViewId): ViewId => {
	if (previousView === 'settings') return 'dashboard';
	return 'dashboard';
};
