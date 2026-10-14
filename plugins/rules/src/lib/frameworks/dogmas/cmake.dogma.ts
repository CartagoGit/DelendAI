import type { IDogmaAdapter } from '../contracts';

/**
 * CMake dogma.
 */
export const CMAKE_DOGMA: IDogmaAdapter = {
	language: 'cmake',
	displayName: 'CMake',
	version: 'cmake-1.0',
	packageManager: 'cmake',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic CMake code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
