import type { IDogmaAdapter } from '../contracts';

/**
 * LaTeX dogma.
 */
export const TEX_DOGMA: IDogmaAdapter = {
	language: 'tex',
	displayName: 'LaTeX',
	version: 'tex-1.0',
	packageManager: 'texlive',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic LaTeX code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
