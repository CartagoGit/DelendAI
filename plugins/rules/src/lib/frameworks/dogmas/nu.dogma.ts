import type { IDogmaAdapter } from '../contracts';

/**
 * Nushell dogma.
 */
export const NU_DOGMA: IDogmaAdapter = {
	language: 'nu',
	displayName: 'Nushell',
	version: 'nu-1.0',
	packageManager: 'nu',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Nushell code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
