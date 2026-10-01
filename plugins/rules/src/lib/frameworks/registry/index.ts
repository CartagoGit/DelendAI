/**
 * Barrel for the registry layer. The composition root for presets,
 * dogmas, and detection — the only place that wires concrete
 * adapters into the abstract classes.
 *
 * Single Responsibility: re-exports. The factory lives in its
 * own file (`factory.ts`) so callers can import the composition
 * root without dragging in the abstract class definitions, and
 * vice versa.
 */
export { PresetRegistry, type IAreaRulesLite } from './preset-registry';
export { DogmaRegistry } from './dogma-registry';
export { PresetDetector } from './detector';
export {
	buildDefaultRegistry,
	type ICompositionRoot as IDefaultRegistryCompositionRoot,
} from './default-registry';
export {
	buildDefaultComposition,
	type ICompositionRoot,
} from './factory';
export {
	defaultPresetValidator,
	composeValidators,
	type IPresetValidator,
	type IPresetFinding,
} from './validator';
export {
	buildValidatorRegistry,
	type IValidatorRegistry,
} from './validator-registry';
export {
	composeRoot,
	buildDefaultRenderers,
	defaultPolicyResolver,
} from './composition-root';
