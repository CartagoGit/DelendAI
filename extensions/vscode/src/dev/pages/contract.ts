/**
 * `extensions/vscode/src/dev/pages/contract.ts` — typed
 * contract for the dev entry's lazy page modules.
 *
 * Why a contract file (and not just `import()`-ing whatever
 * shape each page exports)?
 *   - Forces every page to declare the same surface. Adding a
 *     new field at the registry (e.g. `cleanup(root)` for
 *     resource teardown) is a single-place change.
 *   - Lets `entry.ts` be a pure orchestrator: it imports only
 *     this contract + the page registry, never the page
 *     implementations, so the entry bundle stays small and
 *     `dynamic import()` is the only path that pulls the page
 *     code in.
 *   - Keeps the `ViewId` ↔ page ID mapping as a literal type
 *     that the registry can exhaustively narrow on.
 *
 * Conventions
 * -----------
 *   - `id` matches the ViewId in `./state.ts` so the sidebar /
 *     router can dispatch by ID without a parallel table.
 *   - `label` is the human-readable name rendered in the
 *     sidebar. Hosts that want i18n can wrap the registry.
 *   - `render(root, deps)` is the entry point; it owns the
 *     page's DOM lifecycle (mount → render → bind). It is
 *     awaited so callers know when a page is ready (e.g. to
 *     time a cross-fade).
 *   - `cssImports` is the list of CSS module imports the page
 *     needs injected before it renders. The orchestrator
 *     `ensurePageStyles` helper deduplicates and appends a
 *     single `<style data-mcpv-page="<id>">` per page so the
 *     page-specific styles only land when the page is
 *     mounted, not as part of the entry bundle.
 *
 * Future direction
 * ----------------
 *   - A `cleanup?: (root) => void` field gets added when we
 *     wire up route-leave animations — the previous page's
 *     cleanup is the natural anchor point.
 *   - `preloadHints?: ReadonlyArray<ViewId>` declares which
 *     pages the dev entry should fetch on idle (so clicking
 *     Settings from Dashboard is instantaneous). Marked
 *     optional so the contract stays minimal for now.
 */

import type { Lang } from '@mcp-vertex/shared/i18n';

import type { ISetupStatus } from '../settings-panel';

export type { ViewId } from '../state';

/**
 * Runtime dependencies the orchestrator hands to a page. Every
 * page gets the same set; pages that do not need a given dep
 * simply ignore it. Keeping this in one place avoids per-page
 * ad-hoc `fetchJson` re-definitions.
 */
export interface IPageDeps {
	/** Result of `/api/setup/status?cwd=…`. */
	readonly status: ISetupStatus | null;
	/** Persisted UI prefs (theme, language). */
	readonly lang: Lang;
}

/**
 * The page module contract. Each file under `pages/` exports a
 * single `IPage` value matching this shape. The orchestrator
 * `import()`s the module on demand and calls `render`.
 */
export interface IPage {
	readonly id:
		| 'dashboard'
		| 'configuration'
		| 'settings'
		| 'tool-detail'
		| 'metrics';
	readonly label: string;
	/** CSS module specifiers the page needs mounted. Optional;
	 *  most pages share the global dev-preview bundle. */
	readonly cssImports?: ReadonlyArray<string>;
	/**
	 * Mount the page inside `root`. Returns when the page is
	 * ready (its first render + bindings completed). Pages that
	 * need to fetch (e.g. dashboard reading `/api/dashboard`)
	 * await their own fetch.
	 */
	render: (root: HTMLElement, deps: IPageDeps) => Promise<void> | void;
	/** Cancel timers, requests and listeners owned by the current mount. */
	dispose?: () => void;
}

/**
 * Type guard for the page id union. Mirrors the `ViewId` union
 * in `state.ts` so adding a new ID is a single-line change
 * here plus a `WEBVIEWS` entry; the union is the source of
 * truth and consumers narrow on it.
 */
export const isPageId = (s: string): s is IPage['id'] =>
	s === 'dashboard' ||
	s === 'configuration' ||
	s === 'settings' ||
	s === 'tool-detail' ||
	s === 'metrics';
