import type { IDogmaAdapter } from '../contracts';

/**
 * Ninja dogma.
 */
export const NINJA_DOGMA: IDogmaAdapter = {
	language: 'ninja',
	displayName: 'Ninja',
	version: 'ninja-1.0',
	packageManager: 'ninja',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Ninja code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
