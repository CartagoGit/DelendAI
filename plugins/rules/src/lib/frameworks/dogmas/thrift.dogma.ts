import type { IDogmaAdapter } from '../contracts';

/**
 * Thrift dogma.
 */
export const THRIFT_DOGMA: IDogmaAdapter = {
	language: 'thrift',
	displayName: 'Thrift',
	version: 'thrift-1.0',
	packageManager: 'thrift',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Thrift code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
