import type { IDogmaAdapter } from '../contracts';

/**
 * Crystal dogma.
 */
export const CRYSTAL_DOGMA: IDogmaAdapter = {
	language: 'crystal',
	displayName: 'Crystal',
	version: 'crystal-1.0',
	packageManager: 'shards',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Crystal code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
