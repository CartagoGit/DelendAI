import type { IDogmaAdapter } from '../contracts';

/**
 * Groovy dogma.
 */
export const GROOVY_DOGMA: IDogmaAdapter = {
	language: 'groovy',
	displayName: 'Groovy',
	version: 'groovy-1.0',
	packageManager: 'gradle',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Groovy code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
