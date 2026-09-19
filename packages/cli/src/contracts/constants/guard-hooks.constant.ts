import type { IGuardHookName } from '@delendai/core/cli';

/** The hooks `delendai guard install` writes the policy guard into. */
export const GUARDED_HOOKS: readonly IGuardHookName[] = [
	'pre-commit',
	'reference-transaction',
	'pre-push',
];
