import type { IDogmaAdapter } from '../contracts';

/**
 * Nix dogma.
 */
export const NIX_DOGMA: IDogmaAdapter = {
	language: 'nix',
	displayName: 'Nix',
	version: 'nix-1.0',
	packageManager: 'nix',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Nix code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
