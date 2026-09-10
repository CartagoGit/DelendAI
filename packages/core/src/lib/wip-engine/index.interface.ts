/**
 * Contract shapes for `./index`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `index.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `index.ts`, so no import site changes.
 */

import { createOrUpdateWipRef, type IWipEngineContext } from './checkpoint';
import { rebaseWipOntoNewBase } from './rebase';
import { restorePathsFromRef } from './restore';
import type {
	IWipCheckpointRequest,
	IWipCheckpointResult,
	IWipRebaseRequest,
	IWipRebaseResult,
	IWipRestoreRequest,
	IWipRestoreResult,
} from './types.interface';

/** The three operations, bound to one repository. */
export interface IWipEngine {
	/** Repository the engine is bound to. */
	readonly context: IWipEngineContext;
	readonly createOrUpdateWipRef: (
		request: IWipCheckpointRequest,
	) => Promise<IWipCheckpointResult>;
	readonly restorePathsFromRef: (
		request: IWipRestoreRequest,
	) => Promise<IWipRestoreResult>;
	readonly rebaseWipOntoNewBase: (
		request: IWipRebaseRequest,
	) => Promise<IWipRebaseResult>;
}
