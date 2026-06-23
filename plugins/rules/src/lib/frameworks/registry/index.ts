/**
 * Barrel for the registry layer. The composition root for presets,
 * dogmas, and detection — the only place that wires concrete
 * adapters into the abstract classes.
 */
export { PresetRegistry, type IAreaRulesLite } from './preset-registry';
export { DogmaRegistry } from './dogma-registry';
export { PresetDetector } from './detector';
