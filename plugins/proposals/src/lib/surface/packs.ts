/**
 * Capability packs of the `proposals` tool surface.
 *
 * Every registration id belongs to exactly one pack, named for what a
 * session does with it. A pack decides nothing on the wire by itself:
 * `disclosure.ts` decides which tools a session lists up front, and a
 * tool that is not listed stays callable through the router. The packs
 * exist so that the listed set can be argued from what a session came
 * to do (read, author, review, work, repair) instead of from one fixed
 * list, and so that the cost of each group is measured by name.
 *
 * The map lives in contracts/constants and is typed over the closed union
 * of ids: a tool added to the plugin without
 * a pack is a compile error here, and `packs.spec.ts` compares the map
 * with the generated catalog.
 */
import { PROPOSALS_TOOL_PACK } from '../contracts/constants/proposals-tool-pack.constant';
import type { IProposalsPack } from '../contracts/interfaces/proposals-pack.interface';
import type { IProposalsToolId } from './disclosure';

export const proposalsPackOf = (id: IProposalsToolId): IProposalsPack =>
	PROPOSALS_TOOL_PACK[id];

/** Ids of one pack, in the order the pack map declares them. */
export const proposalsToolIdsInPack = (
	pack: IProposalsPack,
): readonly IProposalsToolId[] =>
	(Object.keys(PROPOSALS_TOOL_PACK) as IProposalsToolId[]).filter(
		(id) => PROPOSALS_TOOL_PACK[id] === pack,
	);
