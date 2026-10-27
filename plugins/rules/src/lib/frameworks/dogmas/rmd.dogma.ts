import type { IDogmaAdapter } from '../contracts';

/**
 * R Markdown dogma.
 */
export const RMD_DOGMA: IDogmaAdapter = {
	language: 'rmd',
	displayName: 'R Markdown',
	version: 'rmd-1.0',
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
		'Write clean, idiomatic R Markdown code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
