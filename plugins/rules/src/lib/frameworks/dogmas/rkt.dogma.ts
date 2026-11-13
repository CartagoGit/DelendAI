import type { IDogmaAdapter } from '../contracts';

/**
 * Racket dogma.
 */
export const RKT_DOGMA: IDogmaAdapter = {
	language: 'rkt',
	displayName: 'Racket',
	version: 'rkt-1.0',
	packageManager: 'raco',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Racket code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
