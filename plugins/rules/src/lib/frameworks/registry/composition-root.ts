import type {
	IDogmaAdapter,
	ILanguageAdapter,
	IRulePreset,
} from '../contracts';
import { DogmaRendererRegistry, stringDogmaRenderer } from '../dogmas/renderer';

import type { IPolicyResolver } from '../../tools/policy-resolver';
import { PROJECT_OVER_DOGMA_OVER_DEFAULT } from '../../tools/policy-resolver';

import { DogmaRegistry } from './dogma-registry';
import { PresetDetector } from './detector';
import { PresetRegistry } from './preset-registry';
import type { IValidatorRegistry } from './validator-registry';

/**
 * The composition root — the **single** object a tool / test
 * / skill imports to access *all* the SOLID seams of the
 * plugin.
 *
 * Single Responsibility: this interface is the *only* place
 * that lists what the composition contains. Adding a new
 * seam (e.g. a `IPolicyAuditor` for f00051 S3) is one new
 * field here + one new constructor argument. Nothing else
 * changes.
 *
 * Dependency Inversion: a consumer takes an
 * `ICompositionRoot` via constructor injection; it never
 * reaches into the registries or the policy resolver
 * directly.
 */
export interface ICompositionRoot {
	readonly registry: PresetRegistry;
	readonly dogmas: DogmaRegistry;
	readonly detector: PresetDetector;
	/** OCP — adding a validator = appending here, no other file changes. */
	readonly validators: IValidatorRegistry;
	/** DIP — the renderer is an interface, not the default string renderer. */
	readonly renderers: DogmaRendererRegistry;
	/** S — the priority order (`project > dogma > default`) lives in this single field. */
	readonly policyResolver: IPolicyResolver;
}

/**
 * Compose the SOLID seams into a single object. The function
 * takes every seam as a parameter (DIP) so a test can
 * substitute any of them. The default wiring is in
 * `factory.ts`; this function is the *type-safe assembler*
 * the factory calls.
 */
export const composeRoot = (options: {
	readonly presets: readonly IRulePreset[];
	readonly adapters: readonly ILanguageAdapter[];
	readonly dogmas: readonly IDogmaAdapter[];
	readonly validators: IValidatorRegistry;
	readonly renderers: DogmaRendererRegistry;
	readonly policyResolver: IPolicyResolver;
}): ICompositionRoot => {
	const registry = new PresetRegistry({
		presets: options.presets,
		adapters: options.adapters,
		defaultCommandSetProvider: (_areaDir, _rules) => ({
			checkCommand: 'echo "no linter configured for this area"',
		}),
	});
	const dogmaRegistry = new DogmaRegistry(options.dogmas);
	const detector = new PresetDetector(registry);
	return {
		registry,
		dogmas: dogmaRegistry,
		detector,
		validators: options.validators,
		renderers: options.renderers,
		policyResolver: options.policyResolver,
	};
};

/**
 * Build the default renderers registry (only the string
 * renderer ships today; future `markdown` / `tool-use` /
 * `html` renderers drop into the array). Exposed so the
 * factory in `factory.ts` can construct a default composition
 * without re-declaring the renderer list.
 */
export const buildDefaultRenderers = (): DogmaRendererRegistry =>
	new DogmaRendererRegistry([stringDogmaRenderer], 'string');

/**
 * The default policy resolver. `PROJECT_OVER_DOGMA_OVER_DEFAULT`
 * is exported from `tools/policy-resolver.ts`; this re-export
 * lives in the composition layer so the factory has a single
 * import path for every default seam.
 */
export { PROJECT_OVER_DOGMA_OVER_DEFAULT as defaultPolicyResolver };
