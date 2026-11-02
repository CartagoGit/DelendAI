import type { IDogmaAdapter } from '../contracts';

/**
 * Tcl dogma.
 */
export const TCL_DOGMA: IDogmaAdapter = {
	language: 'tcl',
	displayName: 'Tcl',
	version: 'tcl-1.0',
	packageManager: 'tcl',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Tcl code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
