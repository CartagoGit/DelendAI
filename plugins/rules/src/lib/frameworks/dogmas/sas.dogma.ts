import type { IDogmaAdapter } from '../contracts';

/**
 * SAS dogma.
 */
export const SAS_DOGMA: IDogmaAdapter = {
	language: 'sas',
	displayName: 'SAS',
	version: 'sas-1.0',
	packageManager: 'sas',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic SAS code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
