import type {
	ILanguageAdapter,
	IDogmaAdapter,
	IRulePreset,
	ICommandSetProvider,
} from '../contracts';
import { eslintCommandSetProvider } from '../languages/base/eslint-base.provider';
import { rustAdapter } from '../languages/rust/rust.adapter';
import { RUST_DOGMA } from '../dogmas/rust.dogma';
import { DEFAULT_DOGMA_ADAPTERS } from '../dogmas';
import { ALL_PRESET_DATA } from '../presets/data';

import { DogmaRegistry } from './dogma-registry';
import { PresetDetector } from './detector';
import { PresetRegistry, type IAreaRulesLite } from './preset-registry';

/**
 * The composition root (DIP — the single place that knows how to
 * wire every concrete adapter, preset, and dogma into the
 * abstract registries). Consumers (tools, tests) call this
 * once and pass the resulting registries around via constructor
 * injection; they never rebuild the wiring themselves.
 *
 * Single Responsibility: this file's only job is to declare the
 * default wiring. It does not contain detection, command logic,
 * or dogma rendering — those live in their respective layers.
 *
 * Open/Closed: adding a new language = adding one entry to the
 * arrays below (and the adapter/data/dogma files they point at).
 * The factory itself never needs to change.
 */
export interface ICompositionRoot {
	readonly registry: PresetRegistry;
	readonly dogmas: DogmaRegistry;
	readonly detector: PresetDetector;
}

export const buildDefaultComposition = (
	overrides: {
		readonly presets?: readonly IRulePreset[];
		readonly adapters?: readonly ILanguageAdapter[];
		readonly dogmas?: readonly IDogmaAdapter[];
		/**
		 * Optional override for the default `ICommandSetProvider`
		 * used by adapters that do not bring their own. Today every
		 * adapter that ships brings its own provider; this exists
		 * for testability (a test can pass a deterministic stub).
		 */
		readonly defaultCommandSetProvider?: ICommandSetProvider;
	} = {},
): ICompositionRoot => {
	const presets = overrides.presets ?? ALL_PRESET_DATA;
	const adapters = overrides.adapters ?? [rustAdapter];
	const dogmas = overrides.dogmas ?? DEFAULT_DOGMA_ADAPTERS;
	const defaultProvider =
		overrides.defaultCommandSetProvider ?? eslintCommandSetProvider;

	const registry = new PresetRegistry({
		presets,
		adapters,
		// The `eslintCommandSetProvider` satisfies the
		// `defaultCommandSetProvider` contract by shape; cast is
		// safe because both call signatures are `buildCommandSet(areaDir, rules) → ICommandSet`.
		defaultCommandSetProvider: ((areaDir: string, rules: IAreaRulesLite) =>
			defaultProvider.buildCommandSet(areaDir, rules)) as (
			areaDir: string,
			rules: IAreaRulesLite,
		) => import('../contracts').ICommandSet,
	});
	const dogmaRegistry = new DogmaRegistry(dogmas);
	const detector = new PresetDetector(registry);
	return { registry, dogmas: dogmaRegistry, detector };
};
