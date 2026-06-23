import { eslintCommandSetProvider } from '../languages/base/eslint-base.provider';
import { rustAdapter } from '../languages/rust/rust.adapter';
import { DEFAULT_DOGMA_ADAPTERS } from '../dogmas';
import { ALL_PRESET_DATA } from '../presets/data';
import { VANILLA_JS_FALLBACK_PRESET } from '../presets/data/fallback';

import type {
	ILanguageAdapter,
	IDogmaAdapter,
	IRulePreset,
	ICommandSetProvider,
	ICommandSet,
} from '../contracts';
import type { IAreaRulesLite } from './preset-registry';
import type { IPresetValidator } from './validator';
import type { IPolicyResolver } from '../../tools/policy-resolver';

import {
	buildDefaultRenderers,
	composeRoot,
	defaultPolicyResolver,
	type ICompositionRoot,
} from './composition-root';
import { DogmaRegistry } from './dogma-registry';
import { PresetDetector } from './detector';
import { PresetRegistry } from './preset-registry';
import { buildValidatorRegistry } from './validator-registry';

/**
 * Re-export the amplified composition root shape so callers
 * that import `ICompositionRoot` from `factory.ts` get the
 * full SOLID surface (registry + detector + validators +
 * renderers + policyResolver).
 */
export type { ICompositionRoot };

/**
 * The composition root (DIP — the single place that knows how
 * to wire every concrete adapter, preset, dogma, validator,
 * renderer, and policy resolver into a single object).
 * Consumers (tools, tests) call this once and pass the
 * resulting `ICompositionRoot` around via constructor
 * injection; they never rebuild the wiring themselves.
 *
 * Single Responsibility: this file's only job is to declare
 * the default wiring. It does not contain detection, command
 * logic, dogma rendering, or validation — those live in
 * their respective layers.
 *
 * Open/Closed: adding a new language = adding one entry to
 * the arrays below (and the adapter/data/dogma files they
 * point at). Adding a new SOLID seam (e.g. an auditor) is
 * adding one field to `ICompositionRoot` and one parameter
 * to `composeRoot` — no other file changes.
 */
export const buildDefaultComposition = (
	overrides: {
		readonly presets?: readonly IRulePreset[];
		readonly adapters?: readonly ILanguageAdapter[];
		readonly dogmas?: readonly IDogmaAdapter[];
		/**
		 * Optional override for the default `ICommandSetProvider`
		 * used by adapters that do not bring their own. Today
		 * every adapter that ships brings its own provider; this
		 * exists for testability (a test can pass a deterministic
		 * stub).
		 */
		readonly defaultCommandSetProvider?: ICommandSetProvider;
		/**
		 * Optional override for the validators list. Defaults to
		 * `[defaultPresetValidator]`. A test can pass an empty
		 * list to disable validation.
		 */
		readonly validators?: readonly IPresetValidator[];
		/**
		 * Optional override for the policy resolver. Defaults to
		 * `PROJECT_OVER_DOGMA_OVER_DEFAULT`. A host that wants
		 * a different priority order (e.g. "treat dogma as
		 * advisory only") can pass a different implementation.
		 */
		readonly policyResolver?: IPolicyResolver;
	} = {},
): ICompositionRoot => {
	// The vanilla-js fallback is always present (S — the
	// fallback is a real preset, not a magic string).
	const presets = overrides.presets ?? [
		VANILLA_JS_FALLBACK_PRESET,
		...ALL_PRESET_DATA,
	];
	const adapters = overrides.adapters ?? [rustAdapter];
	const dogmas = overrides.dogmas ?? DEFAULT_DOGMA_ADAPTERS;
	const provider: ICommandSetProvider =
		overrides.defaultCommandSetProvider ?? eslintCommandSetProvider;
	// PresetRegistry takes a plain callback; ICommandSetProvider is an
	// object with a `buildCommandSet` method (DIP seam). The adapter
	// below bridges the two so the public override surface stays the
	// ICommandSetProvider contract callers already use.
	const defaultProvider = (
		areaDir: string,
		rules: IAreaRulesLite,
	): ICommandSet => provider.buildCommandSet(areaDir, rules);
	const validators = buildValidatorRegistry(overrides.validators);
	const renderers = buildDefaultRenderers();
	const policyResolver = overrides.policyResolver ?? defaultPolicyResolver;

	// Single Responsibility: the composition root (a *shape*)
	// is assembled by `composeRoot`. The factory (this file)
	// is the *wiring* of defaults. The two are decoupled so
	// tests can call `composeRoot` directly with a synthetic
	// set of seams (no defaults needed).
	const root = composeRoot({
		presets,
		adapters,
		dogmas,
		validators,
		renderers,
		policyResolver,
	});

	// The public factory overrides the registry/detector/dogmas
	// with instances wired to the caller's `defaultCommandSetProvider`,
	// so the legacy smoke test that asserts
	// `root.registry.commandsFor(...)` uses the caller-supplied
	// default (when an adapter does not bring its own).
	const registry = new PresetRegistry({
		presets,
		adapters,
		defaultCommandSetProvider: defaultProvider,
	});
	const detector = new PresetDetector(registry);
	const dogmasRegistry = new DogmaRegistry(dogmas);

	return {
		...root,
		registry,
		detector,
		dogmas: dogmasRegistry,
	};
};
