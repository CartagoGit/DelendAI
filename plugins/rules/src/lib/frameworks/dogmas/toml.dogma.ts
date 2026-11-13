import type { IDogmaAdapter } from '../contracts';

/**
 * TOML dogma.
 */
export const TOML_DOGMA: IDogmaAdapter = {
	language: 'toml',
	displayName: 'TOML',
	version: 'toml-1.0',
	packageManager: 'cargo',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic TOML code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
