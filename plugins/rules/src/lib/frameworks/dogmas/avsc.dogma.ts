import type { IDogmaAdapter } from '../contracts';

/**
 * Avro Schema dogma.
 */
export const AVSC_DOGMA: IDogmaAdapter = {
	language: 'avsc',
	displayName: 'Avro Schema',
	version: 'avsc-1.0',
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
		'Write clean, idiomatic Avro Schema code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
