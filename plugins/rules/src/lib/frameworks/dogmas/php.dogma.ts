import type { IDogmaAdapter } from '../contracts';

/**
 * PHP dogma.
 */
export const PHP_DOGMA: IDogmaAdapter = {
	language: 'php',
	displayName: 'PHP',
	version: 'php-1.0',
	packageManager: 'composer',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic PHP code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
