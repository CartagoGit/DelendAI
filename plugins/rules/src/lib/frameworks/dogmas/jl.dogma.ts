import type { IDogmaAdapter } from '../contracts';

/**
 * Julia dogma.
 */
export const JL_DOGMA: IDogmaAdapter = {
	language: 'jl',
	displayName: 'Julia',
	version: 'jl-1.0',
	packageManager: 'julia',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Julia code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
