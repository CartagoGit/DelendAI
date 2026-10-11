import type { IDogmaAdapter } from '../contracts';

/**
 * Elm dogma.
 */
export const ELM_DOGMA: IDogmaAdapter = {
	language: 'elm',
	displayName: 'Elm',
	version: 'elm-1.0',
	packageManager: 'elm',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Elm code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
