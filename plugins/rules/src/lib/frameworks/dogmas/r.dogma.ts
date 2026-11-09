import type { IDogmaAdapter } from '../contracts';

/**
 * R dogma.
 */
export const R_DOGMA: IDogmaAdapter = {
	language: 'r',
	displayName: 'R',
	version: 'r-1.0',
	packageManager: 'cran',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic R code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
