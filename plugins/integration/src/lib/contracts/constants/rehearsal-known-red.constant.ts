import type { IRehearsalKnownRed } from '../interfaces/rehearsal.interface';

/**
 * The scenarios that are red against today's land, each with the slice
 * that makes it green. The list may only shrink; activation requires it
 * empty.
 */
export const REHEARSAL_KNOWN_RED: readonly IRehearsalKnownRed[] = [];
