/**
 * checkout-arg.constant.ts — one spelling of "which checkout is this for".
 *
 * Every tool that writes files into the repository needs the same
 * argument, and each tool inventing its own name and its own wording is
 * how an agent ends up guessing. One schema, one description, so the
 * catalog reads the same whichever tool the agent reaches.
 *
 * `checkoutForRequest` is the other half: this declares the argument,
 * that one decides whether the path may be written to.
 */
import z from 'zod';

export const CHECKOUT_ARG_DESCRIPTION =
	'Absolute path to the working tree this write belongs in. Pass your own worktree, or the write lands in the server\u2019s checkout \u2014 on the integration branch. Must be a working tree of this same repository. Omit for the server\u2019s root.';

export const CHECKOUT_ARG_SCHEMA = z
	.string()
	.min(1)
	.describe(CHECKOUT_ARG_DESCRIPTION);
