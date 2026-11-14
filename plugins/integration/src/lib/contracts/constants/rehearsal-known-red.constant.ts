import type { IRehearsalKnownRed } from '../interfaces/rehearsal.interface';

/**
 * The scenarios that are red against today's land, each with the slice
 * that makes it green. The list may only shrink; activation requires it
 * empty.
 */
export const REHEARSAL_KNOWN_RED: readonly IRehearsalKnownRed[] = [
	{ scenario: 'one-pr', fixedBy: 'S6' },
	{ scenario: 'non-overlapping', fixedBy: 'S6' },
	{ scenario: 'overlapping', fixedBy: 'S8' },
	{ scenario: 'red-batch', fixedBy: 'S8' },
	{ scenario: 'derived-conflict', fixedBy: 'S8' },
	{ scenario: 'authored-conflict', fixedBy: 'S6, S7' },
	{ scenario: 'bot-head', fixedBy: 'S8' },
	{ scenario: 'host-offline', fixedBy: 'S11' },
	{ scenario: 'automation-opened', fixedBy: 'S6' },
	{ scenario: 'promotion', fixedBy: 'S6' },
	{ scenario: 'F6', fixedBy: 'S10', realModeOnly: true },
];
