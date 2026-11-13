import type { ILanguageAdapter, IRulePreset, ICommandSet } from '../contracts';

/**
 * The single source of truth for "given a preset id, give me
 * everything". Composes DATA (presets) with BEHAVIOUR (language
 * adapters) and exposes a narrow lookup API.
 *
 * SOLID mapping:
 *   S — single responsibility: lookup + dispatch. The manifest
 *       writer, the tools, and the online-preset lookup all
 *       depend on this *abstraction*, not on a module-level
 *       `Map<string, IRulePreset>` singleton.
 *   O — open/closed: new presets / new languages are added by
 *       constructing a new registry with a different `presets`
 *       / `adapters` array. The class itself never changes.
 *   L — Liskov: every adapter is a substitutable
 *       `ILanguageAdapter`; the registry consumes only the
 *       interface, never a concrete class.
 *   I — interface segregation: callers depend on the narrowest
 *       method they need (`resolvePreset`, `resolveDogma`,
 *       `commandsFor`, `supportedIds`).
 *   D — dependency inversion: this class is constructed with its
 *       dependencies (`presets`, `adapters`, `defaultCommandSetProvider`).
 *       No module-level state.
 */
export class PresetRegistry {
	readonly #presetsById: ReadonlyMap<string, IRulePreset>;
	readonly #adapters: readonly ILanguageAdapter[];
	readonly #defaultCommandSetProvider:
		| ((areaDir: string, rules: IAreaRulesLite) => ICommandSet)
		| undefined;

	constructor(options: {
		readonly presets: readonly IRulePreset[];
		readonly adapters: readonly ILanguageAdapter[];
		/**
		 * Optional: a default `ICommandSetProvider` used when an
		 * adapter does not carry its own `commands`. Most adapters
		 * (every JS/TS one today) omit `commands` and rely on the
		 * default.
		 */
		readonly defaultCommandSetProvider?: (
			areaDir: string,
			rules: IAreaRulesLite,
		) => ICommandSet;
	}) {
		this.#presetsById = new Map(
			options.presets.map((preset) => [preset.id, preset]),
		);
		// Defensive copy + sort: adapters are queried by ascending
		// priority, so we pay the sort once here instead of every
		// call. Array.prototype.sort is stable (ES2019+), so
		// adapters with equal priority keep their registration
		// order (matters for the meta-frameworks H6 invariant).
		this.#adapters = options.adapters
			.slice()
			.sort((a, b) => a.priority - b.priority);
		this.#defaultCommandSetProvider = options.defaultCommandSetProvider;
	}

	/** All preset ids this registry can serve (sorted for stable output). */
	get supportedIds(): readonly string[] {
		return [...this.#presetsById.keys()].sort();
	}

	/** Look up a preset by id; returns `undefined` if absent. */
	resolvePreset(presetId: string): IRulePreset | undefined {
		return this.#presetsById.get(presetId);
	}

	/**
	 * The adapter list, priority-ordered (highest priority first).
	 * Exposed so the detector (the only consumer that needs the
	 * raw list) can iterate without re-sorting.
	 */
	get adapters(): readonly ILanguageAdapter[] {
		return this.#adapters;
	}

	/**
	 * Produce the commands for one area + preset resolution.
	 * Selects the adapter whose `id` matches the preset's
	 * language; falls back to the default provider declared on
	 * the registry (DIP).
	 */
	commandsFor(
		areaDir: string,
		rules: IAreaRulesLite,
		presetLanguage: string,
	): ICommandSet {
		const adapter = this.#adapters.find(
			(a) => a.id === presetLanguage && a.commands !== undefined,
		);
		if (adapter?.commands) {
			return adapter.commands.buildCommandSet(areaDir, rules);
		}
		if (this.#defaultCommandSetProvider) {
			return this.#defaultCommandSetProvider(areaDir, rules);
		}
		// Last-resort: a no-op command set. The tools surface a
		// "missing linter deps" finding rather than failing.
		return { checkCommand: 'echo "no linter available"' };
	}
}

/**
 * The minimal per-area shape the registry needs to build a
 * command set. Kept narrow on purpose (Interface Segregation) so
 * the registry does not depend on the full `IAreaRules` domain
 * shape (which lives in `frameworks/types.ts` for back-compat).
 */
export interface IAreaRulesLite {
	readonly linterConfigs: readonly string[];
	readonly typecheckConfigs: readonly string[];
}
