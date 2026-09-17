/**
 * Contract shapes for `./wip-persistence`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `wip-persistence.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `wip-persistence.ts`, so no import site changes.
 */

import type { IGitRunner } from '@delendai/core/public';
import type { IWorkRefAgentId } from '../services/work-ref-naming.service';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import type {
	IIntegrationHandoffPort,
	IWipCheckpointPort,
} from '../contracts/interfaces/persistence.interface';

/** Everything the WIP arm needs that it cannot derive from the policy. */
export interface ICreatePolicyPersistenceOptions {
	/** Absent means "no policy projected" — the historical path wins. */
	readonly policy?: IResolvedDevelopmentPolicy | undefined;
	/** Scoped git runner used to resolve the base and publish verified WIP refs. */
	readonly run: IGitRunner;
	/** The core WIP engine, injected. Absent disables the WIP route. */
	readonly wip?: IWipCheckpointPort | undefined;
	/** The integration engine, injected by the host when it has one. */
	readonly integration?: IIntegrationHandoffPort | undefined;
	/**
	 * Identity used for the ref name; also stamped on the checkpoint. A
	 * function is called per checkpoint, so an identity learned after
	 * register (the MCP client name) still names the ref.
	 */
	readonly agentId: IWorkRefAgentId;
	/**
	 * What the work is, for the ref's `${topic}`. Absent or `undefined`
	 * leaves the template's default.
	 */
	readonly resolveTopic?: (input: {
		readonly proposalId: string;
		readonly sliceId: string;
	}) => Promise<string | undefined>;
	/** Explicit configured push remote; work persistence never guesses. */
	readonly remote?: string | undefined;
	readonly author?: { readonly name: string; readonly email: string };
	/**
	 * Generation of this work unit. Injected because the number lives in
	 * the operational state model, not here; defaults to 1 so a host that
	 * has no state still gets a stable, valid ref.
	 */
	readonly resolveGeneration?: (input: {
		readonly proposalId: string;
		readonly sliceId: string;
	}) => Promise<number>;
}
