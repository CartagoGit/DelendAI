import type { IDogmaAdapter } from '../contracts';

/**
 * YAML dogma.
 */
export const YAML_DOGMA: IDogmaAdapter = {
	language: 'yaml',
	displayName: 'YAML',
	version: 'yaml-1.0',
	packageManager: 'pip',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic YAML code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
