import type { IDogmaAdapter } from '../contracts';

/**
 * Protobuf dogma.
 */
export const PROTO_DOGMA: IDogmaAdapter = {
	language: 'proto',
	displayName: 'Protobuf',
	version: 'proto-1.0',
	packageManager: 'brew',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Protobuf code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
