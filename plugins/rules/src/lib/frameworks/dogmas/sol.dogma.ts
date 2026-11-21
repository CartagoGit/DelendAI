import type { IDogmaAdapter } from '../contracts';

/**
 * Solidity dogma.
 */
export const SOL_DOGMA: IDogmaAdapter = {
	language: 'sol',
	displayName: 'Solidity',
	version: 'sol-1.0',
	packageManager: 'npm',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Solidity code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
