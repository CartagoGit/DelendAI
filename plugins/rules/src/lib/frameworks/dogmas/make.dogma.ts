import type { IDogmaAdapter } from '../contracts';

/**
 * Make dogma.
 */
export const MAKE_DOGMA: IDogmaAdapter = {
	language: 'make',
	displayName: 'Make',
	version: 'make-1.0',
	packageManager: 'make',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Make code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
