import type { IDogmaAdapter, TPresetLanguage } from '../contracts';

/**
 * Single Responsibility: the registry for language dogmas.
 * **Segregated from `PresetRegistry`** because dogmas are
 * language-style facts, not linter artefacts. A consumer that
 * only needs dogmas (e.g. a future "ownership checker" tool)
 * depends on this class, not on `PresetRegistry`.
 *
 * Dependency Inversion: the registry is constructed with its
 * adapters — no module-level state. Tests inject a 1-element
 * adapter list.
 */
export class DogmaRegistry {
	readonly #byLanguage: ReadonlyMap<TPresetLanguage, IDogmaAdapter>;

	constructor(adapters: readonly IDogmaAdapter[]) {
		this.#byLanguage = new Map(
			adapters.map((adapter) => [adapter.language, adapter]),
		);
	}

	/** All languages this registry can serve (sorted for stable output). */
	get supportedLanguages(): readonly TPresetLanguage[] {
		return [...this.#byLanguage.keys()].sort() as TPresetLanguage[];
	}

	/** Look up a dogma by language tag; returns `undefined` if absent. */
	resolve(language: TPresetLanguage): IDogmaAdapter | undefined {
		return this.#byLanguage.get(language);
	}
}
