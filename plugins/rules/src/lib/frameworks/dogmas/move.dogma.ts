import type { IDogmaAdapter } from '../contracts';

/**
 * Move dogma.
 */
export const MOVE_DOGMA: IDogmaAdapter = {
	language: 'move',
	displayName: 'Move',
	version: 'move-1.0',
	packageManager: 'apt',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Move code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
