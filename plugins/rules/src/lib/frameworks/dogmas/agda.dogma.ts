import type { IDogmaAdapter } from '../contracts';

/**
 * Agda dogma.
 */
export const AGDA_DOGMA: IDogmaAdapter = {
	language: 'agda',
	displayName: 'Agda',
	version: 'agda-1.0',
	packageManager: 'agda',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Agda code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
