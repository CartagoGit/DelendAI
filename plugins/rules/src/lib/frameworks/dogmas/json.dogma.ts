import type { IDogmaAdapter } from '../contracts';

/**
 * JSON dogma.
 */
export const JSON_DOGMA: IDogmaAdapter = {
	language: 'json',
	displayName: 'JSON',
	version: 'json-1.0',
	packageManager: 'npm',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic JSON code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
