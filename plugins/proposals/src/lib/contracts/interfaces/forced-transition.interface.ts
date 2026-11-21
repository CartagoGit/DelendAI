import type { FORCE_SKIPPABLE_GATES } from '../constants/forced-transition.constant';

/** A gate `force` lets a move pass without. */
export type IForceSkippableGate = (typeof FORCE_SKIPPABLE_GATES)[number];

/**
 * Who may force a proposal past its gates.
 *
 * - `agents`: any caller, the default.
 * - `people`: no tool call forces; a person who decides to skip a gate
 *   moves the file and merges by hand, as the owner of the repository.
 */
export type IForceTransitions = 'agents' | 'people';
