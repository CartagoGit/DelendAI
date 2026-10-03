import type { IDogmaAdapter } from '../contracts';

/**
 * Vimscript dogma.
 */
export const VIM_DOGMA: IDogmaAdapter = {
	language: 'vim',
	displayName: 'Vimscript',
	version: 'vim-1.0',
	packageManager: 'vim',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Vimscript code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
