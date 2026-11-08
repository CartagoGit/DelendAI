import type { IDogmaAdapter } from '../contracts';

/**
 * CUE dogma.
 */
export const CUE_DOGMA: IDogmaAdapter = {
	language: 'cue',
	displayName: 'CUE',
	version: 'cue-1.0',
	packageManager: 'cue',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic CUE code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
