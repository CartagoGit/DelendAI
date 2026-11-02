import type { IDogmaAdapter } from '../contracts';

/**
 * OCaml dogma.
 */
export const ML_DOGMA: IDogmaAdapter = {
	language: 'ml',
	displayName: 'OCaml',
	version: 'ml-1.0',
	packageManager: 'opam',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic OCaml code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
