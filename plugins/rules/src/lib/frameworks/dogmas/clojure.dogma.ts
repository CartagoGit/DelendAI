import type { IDogmaAdapter } from '../contracts';

/**
 * Clojure dogma.
 */
export const CLOJURE_DOGMA: IDogmaAdapter = {
	language: 'clojure',
	displayName: 'Clojure',
	version: 'clojure-1.0',
	packageManager: 'deps.edn',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Clojure code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
