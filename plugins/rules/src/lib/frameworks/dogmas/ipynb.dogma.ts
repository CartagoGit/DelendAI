import type { IDogmaAdapter } from '../contracts';

/**
 * Jupyter Notebook dogma.
 */
export const IPYNB_DOGMA: IDogmaAdapter = {
	language: 'ipynb',
	displayName: 'Jupyter Notebook',
	version: 'ipynb-1.0',
	packageManager: 'pip',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Jupyter Notebook code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
