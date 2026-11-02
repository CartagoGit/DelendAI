import type { IDogmaAdapter } from '../contracts';

/**
 * F# dogma.
 */
export const FS_DOGMA: IDogmaAdapter = {
	language: 'fs',
	displayName: 'F#',
	version: 'fs-1.0',
	packageManager: 'nuget',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic F# code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
