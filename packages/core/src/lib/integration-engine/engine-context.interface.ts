/**
 * engine-context.ts — the four collaborators every step is given, and
 * nothing else.
 *
 * WHY the engine takes its world as an argument: each of these is a
 * different kind of authority, and the cycle's correctness depends on not
 * confusing them. The forge is the authority on the integration head, on
 * checks and on the merge. Git is the authority on refs. The state model
 * is the authority on what we have already recorded — and therefore on
 * idempotency. The critical section is the authority on who may advance
 * the branch right now. A step that reached past its collaborator (asked
 * git for the "current" head, say, from a clone that had not fetched)
 * would be reading a stale answer with a confident face.
 *
 * `clock` is injected for the same reason: recorded timestamps must be
 * reproducible in a spec, and no step may call `Date.now()` directly.
 */

import type { IWipEngine } from '../wip-engine/index';
import type { ICriticalSection } from './critical-section';
import type { IIntegrationForge } from './forge-port.interface';
import type { IIntegrationGit } from './git-port.interface';
import type { IIntegrationStatePort } from './state-port.interface';

/** Everything the integration cycle is allowed to touch. */
export interface IIntegrationEngineDeps {
	readonly forge: IIntegrationForge;
	readonly git: IIntegrationGit;
	readonly state: IIntegrationStatePort;
	/** Used only to replay a candidate onto a moved integration head. */
	readonly wip: IWipEngine;
	readonly criticalSection: ICriticalSection;
	/** Milliseconds since the epoch. Injected so specs are deterministic. */
	readonly clock: () => number;
}
