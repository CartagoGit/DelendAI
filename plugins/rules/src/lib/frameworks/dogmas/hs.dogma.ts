import type { IDogmaAdapter } from '../contracts';

/**
 * Haskell dogma.
 */
export const HS_DOGMA: IDogmaAdapter = {
	language: 'hs',
	displayName: 'Haskell',
	version: 'hs-1.0',
	packageManager: 'cabal',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Haskell code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
