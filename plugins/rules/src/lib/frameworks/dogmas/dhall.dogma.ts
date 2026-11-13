import type { IDogmaAdapter } from '../contracts';

/**
 * Dhall dogma.
 */
export const DHALL_DOGMA: IDogmaAdapter = {
	language: 'dhall',
	displayName: 'Dhall',
	version: 'dhall-1.0',
	packageManager: 'dhall',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Dhall code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
