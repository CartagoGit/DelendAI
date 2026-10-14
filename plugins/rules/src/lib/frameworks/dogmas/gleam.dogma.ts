import type { IDogmaAdapter } from '../contracts';

/**
 * Gleam dogma.
 */
export const GLEAM_DOGMA: IDogmaAdapter = {
	language: 'gleam',
	displayName: 'Gleam',
	version: 'gleam-1.0',
	packageManager: 'gleam',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Gleam code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
