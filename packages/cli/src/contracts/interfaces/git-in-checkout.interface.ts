import type { IGitCommandResult } from '@delendai/core/runtime';

/** A git command run in one checkout. */
export type IGitInCheckout = (args: readonly string[]) => IGitCommandResult;
