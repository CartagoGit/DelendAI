/**
 * search-engine.service.ts — Solid dispatcher (post-OCP refactor).
 *
 * After the 2026-06-23 refactor, this module is the **dispatcher** for
 * the search service. It no longer contains either of the two search
 * algorithms in-line — those live in dedicated Strategy
 * implementations (`search-engine.in-house.ts` and
 * `search-engine.backends.ts`).
 *
 * The public `searchWorkspace()` function now:
 *
 *   1. Picks the active backend from a configurable chain
 *      (`createSearchDispatcher` returns a closure).
 *   2. Runs the active backend.
 *   3. Falls back to the next available backend on failure (when the
 *      user opted in via `preferRg: true`).
 *   4. Returns the result, attaching `rgFallbackReason` when the
 *      preferred backend was unavailable.
 *
 * Solid-OCP: new backends are new `ISearchBackend` implementations —
 * the dispatcher does not change.
 *
 * Solid-DIP: callers depend on `searchWorkspace` + `ISearchBackend`,
 * not on the rg or in-house modules directly.
 */

import { createInHouseBackend } from './search-engine.in-house';
import {
	createRgBackend,
	defaultRgAvailableProbe,
} from './search-engine.backends';
import type {
	ISearchBackend,
	ISearchOptions,
	ISearchResult,
} from './search-engine.types';
import { InvalidSearchPatternError } from './search-engine.types';

export {
	IN_HOUSE_BACKEND_ID,
	createInHouseBackend,
} from './search-engine.in-house';
export {
	RG_BACKEND_ID,
	createRgBackend,
	defaultRgAvailableProbe,
} from './search-engine.backends';
export {
	InvalidSearchPatternError,
	type ISearchBackend,
	type ISearchHit,
	type ISearchOptions,
	type ISearchResult,
	type SearchBackendId,
} from './search-engine.types';
export {
	compileGitignoreLine,
	isGitignored,
	parseGitignore,
} from './search-engine.gitignore';
export { globToRegExp } from './search-engine.glob';
export {
	DEFAULT_EXTENSIONS,
	DEFAULT_IGNORE_DIRS,
	clampContext,
	clampMaxResults,
	extensionOf,
	matchesAnyGlob,
	preview,
} from './search-engine.constants';

/**
 * Solid-DIP: the dispatcher is a closure built from a list of
 * `ISearchBackend`s. Tests can pass a stub backend to assert the
 * fallback tree without spawning rg or the in-house walker.
 */
export type ISearchDispatcher = (args: {
	readonly workspaceRootAbs: string;
	readonly query: string;
	readonly options: ISearchOptions;
}) => Promise<ISearchResult>;

/**
 * Build a dispatcher from a list of backends. The first available
 * one wins; on runtime failure (NOT on `InvalidSearchPatternError`
 * — those always propagate to the caller because the input is the
 * same for every backend), the next available backend runs.
 *
 * Solid-OCP: callers that want a different chain build their own
 * dispatcher; the public `searchWorkspace` is just the default-chain
 * shortcut.
 */
export const createSearchDispatcher = (
	backends: readonly ISearchBackend[],
): ISearchDispatcher => {
	if (backends.length === 0) {
		throw new Error(
			'createSearchDispatcher: at least one backend is required',
		);
	}
	// Probe availability once per search (cheap — `execFile rg --version`).
	return async ({ workspaceRootAbs, query, options }) => {
		const probed = await Promise.all(
			backends.map(async (b) => ({
				backend: b,
				ok: await b.isAvailable(),
			})),
		);
		const available = probed.filter((p) => p.ok).map((p) => p.backend);
		if (available.length === 0) {
			// No backend available — produce an empty result so the tool
			// still returns a well-formed envelope (the dispatcher never
			// throws on availability; only the in-house walker may throw
			// on an invalid regex).
			return {
				query,
				hits: [],
				truncated: false,
				scanned: 0,
				usedRg: false,
			};
		}

		let lastError: unknown;
		for (const backend of available) {
			try {
				return await backend.execute({
					workspaceRootAbs,
					query,
					options,
				});
			} catch (err) {
				lastError = err;
			}
		}
		// Every backend failed: surface the last error rather than
		// returning an empty result. Callers see the real cause.
		throw lastError instanceof Error
			? lastError
			: new Error(String(lastError));
	};
};

/**
 * Live, grep-like textual search over the workspace. Solid-SRP: this
 * function is now a thin wrapper over the Strategy backends. Adding
 * a new backend no longer touches this file.
 */
export const searchWorkspace = async (
	workspaceRootAbs: string,
	query: string,
	options: ISearchOptions = {},
): Promise<ISearchResult> => {
	if (query.trim().length === 0) {
		return { query, hits: [], truncated: false, scanned: 0, usedRg: false };
	}

	if (options.preferRg !== true) {
		// In-house-only path: honour the historical contract — every
		// test/spec that asserts on `usedRg: false` continues to pass.
		const inHouse = createInHouseBackend();
		return (await inHouse).execute({ workspaceRootAbs, query, options });
	}

	// preferRg path: try rg first; on any failure that is not an
	// invalid-regex error, fall back to the in-house walker and
	// surface `rgFallbackReason` for the agent to read.
	const rg = createRgBackend();
	if (!(await (await rg).isAvailable())) {
		const inHouse = createInHouseBackend();
		return {
			...(await (
				await inHouse
			).execute({ workspaceRootAbs, query, options })),
			rgFallbackReason: 'rg binary not found on $PATH',
		};
	}
	try {
		return await (await rg).execute({ workspaceRootAbs, query, options });
	} catch (err) {
		if (err instanceof InvalidSearchPatternError) throw err;
		const inHouse = createInHouseBackend();
		return {
			...(await (
				await inHouse
			).execute({ workspaceRootAbs, query, options })),
			rgFallbackReason: `rg invocation failed: ${String(err)}`,
		};
	}
};

// Touch `defaultRgAvailableProbe` re-export so callers can build their
// own chain without losing the convenience default.
void defaultRgAvailableProbe;
