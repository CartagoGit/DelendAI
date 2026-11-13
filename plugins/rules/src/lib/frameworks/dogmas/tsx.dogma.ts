import type { IDogmaAdapter } from '../contracts';

/**
 * TSX dogma.
 */
export const TSX_DOGMA: IDogmaAdapter = {
	language: 'tsx',
	displayName: 'TSX',
	version: 'tsx-1.0',
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
		'Write clean, idiomatic TSX code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
