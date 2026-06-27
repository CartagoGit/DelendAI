import type { IDogmaAdapter } from '../contracts';

/**
 * PowerShell dogma.
 */
export const PWSH_DOGMA: IDogmaAdapter = {
	language: 'pwsh',
	displayName: 'PowerShell',
	version: 'pwsh-1.0',
	packageManager: 'pwsh',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic PowerShell code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
