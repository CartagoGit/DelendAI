import type { IDogmaAdapter } from '../contracts';

import { RUST_DOGMA } from './rust.dogma';

export {
	stringDogmaRenderer,
	DogmaRendererRegistry,
	type IDogmaRenderer,
	type IRenderedDogma,
} from './renderer';

/**
 * Barrel + composition root for dogma adapters.
 *
 * Dependency Inversion: `DogmaRegistry` consumes this. Adding a
 * new language = adding one file under `dogmas/<lang>.dogma.ts`
 * and one entry here. The registry / tools / manifest writer
 * never change.
 *
 * Single Responsibility: this file's only job is to list every
 * `IDogmaAdapter` shipped with the plugin. It does not transform,
 * filter, or compose them.
 */
export const DEFAULT_DOGMA_ADAPTERS: readonly IDogmaAdapter[] = [RUST_DOGMA];

export { RUST_DOGMA };
