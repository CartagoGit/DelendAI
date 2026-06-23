import type { IFileReader } from '@mcp-vertex/core/public';

import type { ILanguageAdapter, ILanguageDetection } from '../contracts';

import type { PresetRegistry } from './preset-registry';

/**
 * Orchestrates a list of language adapters (DIP). Knows nothing
 * about specific languages — when `rustAdapter` or `pyAdapter`
 * is added, this class does not change.
 *
 * For each area: collect deps once, iterate adapters in priority
 * order, return the first non-`undefined` detection. Adapters
 * that don't claim the area return `undefined`.
 *
 * Open/Closed: the iteration loop is closed; the adapter list
 * is open.
 */
export class PresetDetector {
	readonly #adapters: readonly ILanguageAdapter[];

	constructor(registry: PresetRegistry) {
		this.#adapters = registry.adapters;
	}

	/**
	 * Resolve one area to a presetId (or `undefined` if no adapter
	 * claims it).
	 */
	detect(
		reader: IFileReader,
		areaDir: string,
	): ILanguageDetection | undefined {
		const deps = this.#readDeps(reader, areaDir);
		for (const adapter of this.#adapters) {
			const hit = adapter.detect(reader, areaDir, deps);
			if (hit !== undefined) return hit;
		}
		return undefined;
	}

	#readDeps(
		reader: IFileReader,
		areaDir: string,
	): Readonly<Record<string, string>> {
		const rel =
			areaDir === '' || areaDir === 'root'
				? 'package.json'
				: `${areaDir}/package.json`;
		const raw = reader.readFile(rel);
		if (raw === undefined) return {};
		try {
			const pkg = JSON.parse(raw) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			return {
				...(pkg.dependencies ?? {}),
				...(pkg.devDependencies ?? {}),
			};
		} catch {
			return {};
		}
	}
}
