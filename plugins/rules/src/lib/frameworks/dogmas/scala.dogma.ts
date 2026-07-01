import type { IDogmaAdapter } from '../contracts';

/**
 * Scala dogma.
 */
export const SCALA_DOGMA: IDogmaAdapter = {
	language: 'scala',
	displayName: 'Scala',
	version: 'scala-1.0',
	packageManager: 'sbt',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Scala code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
