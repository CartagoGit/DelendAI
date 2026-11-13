/** Contract shapes for `./session-handover-run.service`. */

import type { ISessionHandoverSources } from './session-handover.interface';
import type { SESSION_HANDOVER_ACTIONS } from '../contracts/constants/session-handover-command.constant';

export type ISessionHandoverAction = (typeof SESSION_HANDOVER_ACTIONS)[number];

export interface ISessionHandoverRunInput {
	readonly root: string;
	readonly action: ISessionHandoverAction;
	/** The entry `show` prints in full. */
	readonly entry?: string;
	readonly sessionId?: string;
	/** Milliseconds since the epoch; the clock when absent. */
	readonly now?: number;
	/** The readers of the sections; those over this clone's work refs when absent. */
	readonly sources?: ISessionHandoverSources;
}

export interface ISessionHandoverRunResult {
	readonly ok: boolean;
	readonly text: string;
	readonly data: Readonly<Record<string, unknown>>;
}
