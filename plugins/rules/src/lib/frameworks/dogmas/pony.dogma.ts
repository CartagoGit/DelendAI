import type { IDogmaAdapter } from '../contracts';

/**
 * Pony dogma.
 */
export const PONY_DOGMA: IDogmaAdapter = {
	language: 'pony',
	displayName: 'Pony',
	version: 'pony-1.0',
	packageManager: 'pony',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Pony code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
