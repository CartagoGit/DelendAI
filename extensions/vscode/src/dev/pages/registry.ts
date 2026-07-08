/**
 * `extensions/vscode/src/dev/pages/registry.ts` — page
 * registry with lazy chunk loading.
 *
 * The orchestrator (`entry.ts`) imports only this file. The
 * actual page modules (`./dashboard`, `./settings`, …) are
 * loaded on demand via `import('./<name>')`. The bundler
 * (`Bun.build` in `tools/scripts/dev/dev.script.ts`) emits
 * one chunk per dynamic import target — but only when the
 * path is a STRING LITERAL at the call site, not a variable.
 * We therefore dispatch on `id` and call a literal `import()`
 * per case; the bundler statically sees four separate
 * import()s and can chunk them.
 *
 * Why a registry (and not just inline `import()` calls in
 * `entry.ts`)?
 *   - The ID → module spec mapping is a single place to
 *     extend when a new tab is added; `entry.ts` does not
 *     need to know about every page.
 *   - The `navigate` callback can be passed in by the
 *     orchestrator once and reused by every page, avoiding
 *     the circular import (entry → page → entry) that
 *     direct page-level imports would create.
 *   - The cache is a single source of truth for "have I
 *     already loaded this page?" — second clicks are
 *     microtask-cheap.
 *   - Labels and ids come from `knownViewIds()` /
 *     `isViewId()` so adding a new tab is a one-line
 *     change in `state.ts` (the union) plus a new
 *     `import()` branch here.
 */
import type { IPage } from './contract';
import { knownViewIds, type ViewId } from '../state';

/**
 * Arguments the orchestrator hands to the registry. The
 * `navigate` callback is the same for every page; it lets a
 * page trigger a route change without importing `entry.ts`.
 *
 * Each page factory takes a narrower view of `navigate` (the
 * settings page can only route to `'dashboard'`, the dashboard
 * page can only route to `'settings' | 'dashboard'`, the
 * tool-detail and metrics pages do not need it at all). The
 * registry types this once and narrows per-page at the call
 * site — see `#load`.
 */
export interface IRegistryOptions {
	readonly navigate: (id: ViewId) => Promise<void> | void;
}

/** Human-readable label for the sidebar. */
const LABELS: Readonly<Record<ViewId, string>> = {
	dashboard: 'dashboard',
	settings: 'settings',
	'tool-detail': 'tool-detail',
	metrics: 'metrics',
};

/**
 * Resolve a page by id. Each page exports a
 * `create<Name>Page(opts)` factory. The dispatch is a
 * switch with literal `import()` calls so the bundler
 * statically sees one chunk per page.
 */
export class PageRegistry {
	readonly #options: IRegistryOptions;
	readonly #cache = new Map<ViewId, Promise<IPage>>();

	constructor(options: IRegistryOptions) {
		this.#options = options;
	}

	ids(): ReadonlyArray<ViewId> {
		return knownViewIds();
	}

	label(id: ViewId): string {
		return LABELS[id] ?? id;
	}

	resolve(id: ViewId): Promise<IPage> {
		const cached = this.#cache.get(id);
		if (cached) return cached;
		const promise = this.#load(id);
		this.#cache.set(id, promise);
		return promise;
	}

	async #load(id: ViewId): Promise<IPage> {
		// String-literal `import()` calls — one per page, so the
		// bundler can split them into separate chunks. The
		// default branch throws; consumers narrow on `id` first
		// so the unreachable branch is a build-time safety net.
		const opts = this.#options;
		switch (id) {
			case 'dashboard': {
				const mod = await import('./dashboard');
				return mod.createDashboardPage({
					navigate: (next) => opts.navigate(next),
				});
			}
			case 'settings': {
				const mod = await import('./settings');
				return mod.createSettingsPage({
					navigate: (next) => opts.navigate(next),
				});
			}
			case 'tool-detail': {
				const mod = await import('./tool-detail');
				return mod.createToolDetailPage();
			}
			case 'metrics': {
				const mod = await import('./metrics');
				return mod.createMetricsPage();
			}
		}
	}
}
