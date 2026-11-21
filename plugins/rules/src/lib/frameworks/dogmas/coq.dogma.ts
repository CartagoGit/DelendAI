import type { IDogmaAdapter } from '../contracts';

/**
 * Coq dogma.
 */
export const COQ_DOGMA: IDogmaAdapter = {
	language: 'coq',
	displayName: 'Coq',
	version: 'coq-1.0',
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
		'Write clean, idiomatic Coq code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
