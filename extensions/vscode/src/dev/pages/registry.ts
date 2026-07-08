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
 */
import type { IPage } from './contract';
import type { ViewId } from '../state';

/**
 * Arguments the orchestrator hands to the registry. The
 * `navigate` callback is the same for every page; it lets a
 * page trigger a route change without importing `entry.ts`.
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
		return ['dashboard', 'settings', 'tool-detail', 'metrics'];
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
		let mod: Record<string, unknown>;
		switch (id) {
			case 'dashboard':
				mod = await import('./dashboard');
				return (
					mod.createDashboardPage as (opts: IRegistryOptions) => IPage
				)(this.#options);
			case 'settings':
				mod = await import('./settings');
				return (
					mod.createSettingsPage as (opts: IRegistryOptions) => IPage
				)(this.#options);
			case 'tool-detail':
				mod = await import('./tool-detail');
				return (
					mod.createToolDetailPage as (
						opts: IRegistryOptions,
					) => IPage
				)(this.#options);
			case 'metrics':
				mod = await import('./metrics');
				return (
					mod.createMetricsPage as (opts: IRegistryOptions) => IPage
				)(this.#options);
		}
	}
}
