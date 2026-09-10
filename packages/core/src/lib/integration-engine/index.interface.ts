/**
 * Contract shapes for `./index`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `index.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `index.ts`, so no import site changes.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type { ICriticalSection } from './critical-section';
import type { ICleanupStepInput } from './cleanup-step';
import type { IIntegrationEngineDeps } from './engine-context.interface';
import type { IIntegrationForge } from './forge-port.interface';
import type { IIntegrationStatePort } from './state-port.interface';
import type { IIntegrationCycleResult, IWorkRefDisposition } from './types';
import type { IIntegrationCycleRequest } from './run-cycle';

/** What the factory needs that it cannot derive from the repository. */
export interface ICreateIntegrationEngineOptions {
	/** Any path inside the working tree the candidates live in. */
	readonly cwd: string;
	/**
	 * The resolved development policy this repository integrates under.
	 * Required: the engine cannot decide where work may be built from
	 * without knowing which branch the workspace is anchored to, and
	 * guessing it from the repository is the mistake this whole contract
	 * exists to stop.
	 */
	readonly policy: IResolvedDevelopmentPolicy;
	readonly forge: IIntegrationForge;
	readonly state: IIntegrationStatePort;
	/** Defaults to an in-process section; a fleet supplies a lease-backed one. */
	readonly criticalSection?: ICriticalSection;
	readonly clock?: () => number;
	readonly timeoutMs?: number;
}

/** The cycle plus its cleanup, bound to one repository. */
export interface IIntegrationEngine {
	readonly deps: IIntegrationEngineDeps;
	readonly runIntegrationCycle: (
		request: IIntegrationCycleRequest,
	) => Promise<IIntegrationCycleResult>;
	readonly disposeWorkRef: (
		input: ICleanupStepInput,
	) => Promise<IWorkRefDisposition>;
}
