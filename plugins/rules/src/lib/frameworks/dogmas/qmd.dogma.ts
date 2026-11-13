import type { IDogmaAdapter } from '../contracts';

/**
 * Quarto dogma.
 */
export const QMD_DOGMA: IDogmaAdapter = {
	language: 'qmd',
	displayName: 'Quarto',
	version: 'qmd-1.0',
	packageManager: 'quarto',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Quarto code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
