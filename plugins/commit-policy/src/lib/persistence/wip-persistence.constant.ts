/**
 * Constants for `./wip-persistence`, kept apart from its behaviour as the
 * repo's "constants live beside contracts" convention asks.
 */
import type { IIntegrationHandoffReport } from '../contracts/interfaces/persistence.interface';

/** What a durability checkpoint reports about integration: nothing was handed over. */
export const NO_HANDOFF: IIntegrationHandoffReport = {
	attempted: false,
	status: '',
	reason: 'durability checkpoint; never handed to integration',
};
