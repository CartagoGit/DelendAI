import type { IDogmaAdapter } from '../contracts';

/**
 * GraphQL dogma.
 */
export const GRAPHQL_DOGMA: IDogmaAdapter = {
	language: 'graphql',
	displayName: 'GraphQL',
	version: 'graphql-1.0',
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
		'Write clean, idiomatic GraphQL code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
