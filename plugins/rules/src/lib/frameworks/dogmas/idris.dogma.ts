import type { IDogmaAdapter } from '../contracts';

/**
 * Idris dogma.
 */
export const IDRIS_DOGMA: IDogmaAdapter = {
	language: 'idris',
	displayName: 'Idris',
	version: 'idris-1.0',
	packageManager: 'pack',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Idris code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
