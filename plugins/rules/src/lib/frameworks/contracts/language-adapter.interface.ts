import type { IFileReader } from '@mcp-vertex/core/public';

import type { ICommandSetProvider } from './command-set-provider.interface';

/**
 * One language family knows how to:
 *   1. Detect itself inside an area (which files indicate this
 *      language; which meta-frameworks win over which).
 *   2. Optionally produce the per-area command set, via an injected
 *      `ICommandSetProvider`. Adapters that share a command shape
 *      (e.g. every JS/TS adapter uses the ESLint provider) can
 *      leave this undefined and let the registry fall back to the
 *      default provider.
 *
 * Open/Closed: adding a new language = adding one module that
 * implements this interface. The detector, the registry, the
 * manifest writer and the tools are closed for modification.
 *
 * Dependency Inversion: the detector consumes `readonly ILanguageAdapter[]`
 * — concrete adapters are wired in `registry/default-registry.ts`.
 */
export interface ILanguageAdapter {
	/** Stable id, e.g. `js`, `ts`, `py`, `rust`, `go`. */
	readonly id: string;

	/**
	 * Lower number = higher priority. The detector iterates adapters
	 * in priority order and returns the first non-`undefined`
	 * detection. Used to encode "Python beats JS in a polyglot dir",
	 * "meta-frameworks win over plain TS", etc.
	 */
	readonly priority: number;

	/**
	 * Return the framework/preset id this area resolves to
	 * (e.g. `react-ts`, `next-ts`, `rust-clippy`) or `undefined`
	 * if this adapter cannot claim the area.
	 *
	 * @param reader injected so tests are pure over an in-memory FS.
	 * @param areaDir workspace-relative area dir (`''` for root).
	 * @param deps   already-collected `package.json` deps, or `{}`
	 *               if the area ships no `package.json`.
	 */
	detect(
		reader: IFileReader,
		areaDir: string,
		deps: Readonly<Record<string, string>>,
	): Promise<ILanguageDetection | undefined>;

	/**
	 * Optional: produce commands for this area. When omitted, the
	 * registry falls back to the default `ICommandSetProvider`
	 * passed into its constructor.
	 */
	readonly commands?: ICommandSetProvider;
}

export interface ILanguageDetection {
	/** Preset id this detection resolves to. */
	readonly presetId: string;
	/** Human-readable reason for the resolution (shown in `get_rules`). */
	readonly reason: string;
}
