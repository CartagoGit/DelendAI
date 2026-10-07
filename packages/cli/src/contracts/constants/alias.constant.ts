/**
 * alias.constant.ts — b00239 S1.
 */

/**
 * Every alias this tool writes carries this marker, so a later run can
 * tell its own work from somebody else's and remove only what it created.
 * An alias that cannot be proven ours is treated as foreign: the failure
 * mode of guessing wrong is deleting a stranger's executable.
 */
export const ALIAS_MARKER = 'delendai-managed-alias';
