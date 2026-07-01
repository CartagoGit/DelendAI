import type { IDogmaAdapter } from '../contracts';

/**
 * RON dogma.
 */
export const RON_DOGMA: IDogmaAdapter = {
	language: 'ron',
	displayName: 'RON',
	version: 'ron-1.0',
	packageManager: 'cargo',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic RON code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
