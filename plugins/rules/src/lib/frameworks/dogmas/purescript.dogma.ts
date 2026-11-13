import type { IDogmaAdapter } from '../contracts';

/**
 * PureScript dogma.
 */
export const PURESCRIPT_DOGMA: IDogmaAdapter = {
	language: 'purescript',
	displayName: 'PureScript',
	version: 'purescript-1.0',
	packageManager: 'npm',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic PureScript code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
