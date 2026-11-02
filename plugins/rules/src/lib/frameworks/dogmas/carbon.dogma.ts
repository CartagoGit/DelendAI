import type { IDogmaAdapter } from '../contracts';

/**
 * Carbon dogma.
 */
export const CARBON_DOGMA: IDogmaAdapter = {
	language: 'carbon',
	displayName: 'Carbon',
	version: 'carbon-1.0',
	packageManager: 'make',
	ownership: 'manual',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'snake_case',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Carbon code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
