import type { IDogmaAdapter } from '../contracts';

/**
 * HCL dogma.
 */
export const HCL_DOGMA: IDogmaAdapter = {
	language: 'hcl',
	displayName: 'HCL',
	version: 'hcl-1.0',
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
		'Write clean, idiomatic HCL code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
