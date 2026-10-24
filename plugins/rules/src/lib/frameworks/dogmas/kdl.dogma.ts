import type { IDogmaAdapter } from '../contracts';

/**
 * KDL dogma.
 */
export const KDL_DOGMA: IDogmaAdapter = {
	language: 'kdl',
	displayName: 'KDL',
	version: 'kdl-1.0',
	packageManager: 'kdl',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic KDL code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
