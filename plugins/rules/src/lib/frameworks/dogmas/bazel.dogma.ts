import type { IDogmaAdapter } from '../contracts';

/**
 * Bazel dogma.
 */
export const BAZEL_DOGMA: IDogmaAdapter = {
	language: 'bazel',
	displayName: 'Bazel',
	version: 'bazel-1.0',
	packageManager: 'bazel',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Bazel code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
