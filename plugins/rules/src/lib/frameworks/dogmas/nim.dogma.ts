import type { IDogmaAdapter } from '../contracts';

/**
 * Nim dogma.
 */
export const NIM_DOGMA: IDogmaAdapter = {
	language: 'nim',
	displayName: 'Nim',
	version: 'nim-1.0',
	packageManager: 'nimble',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Nim code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
