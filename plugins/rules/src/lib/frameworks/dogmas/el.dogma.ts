import type { IDogmaAdapter } from '../contracts';

/**
 * Emacs Lisp dogma.
 */
export const EL_DOGMA: IDogmaAdapter = {
	language: 'el',
	displayName: 'Emacs Lisp',
	version: 'el-1.0',
	packageManager: 'emacs',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Emacs Lisp code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
