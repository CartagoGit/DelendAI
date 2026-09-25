/**
 * registry-entry.interface.ts — one entry of the proposal registry
 * (`<cacheDir>/proposals/index.json`), as `registryEntryFrom` builds it.
 */
import type {
	IAcceptanceCriterion,
	IProposalBudget,
} from '../../proposals/proposal-document';
import type { IContinuityPolicy, ISwarmBudget } from '../../swarm/swarm-types';

/** The statuses a registry entry may carry, legacy spellings included. */
export type IRegistryProposalStatus =
	| 'pending'
	| 'in_progress'
	| 'ready'
	| 'blocked'
	| 'done'
	| 'retired'
	| 'paused'
	| 'deferred'
	| 'in-progress'
	| 'review';

export interface IProposalExtras {
	budget?: IProposalBudget;
	acceptanceCriteria?: IAcceptanceCriterion[];
	ownership?: string[];
	reservedFiles?: string[];
	agentClosureReportPath?: string;
	swarmBudget?: ISwarmBudget;
	continuityPolicy?: IContinuityPolicy;
	taskQueue?: boolean;
}

export interface IProposalEntry {
	id: string;
	file: string;
	track: string;
	type: string;
	/**
	 * The proposal's kind in this plugin's vocabulary: the frontmatter
	 * `kind` (aliases normalised), else the one its id prefix names, else
	 * `unspecified`. Written here so readers of the index — the catalog,
	 * the host — never re-derive it from a partial copy of the prefixes.
	 */
	kind: string;
	status: IRegistryProposalStatus;
	date: string;
	extras?: IProposalExtras;
	/**
	 * `true` when the proposal lives under `legacy/closed/` — the
	 * archive folder — rather than the active `done/<kind>/` subtree. The
	 * status field still reflects the original workflow status (today always
	 * `done`); `archived` is a *location* marker, not a workflow state, so the
	 * existing DFA stays untouched and downstream consumers that ignore the
	 * flag keep their semantics.
	 */
	archived?: boolean;
}

/** What the registry export reads of one proposal row of the database. */
export interface IRegistryExportRow {
	readonly source_path: string | null;
	readonly frontmatter_json: string | null;
}

/** The registry entries a database yields, and the rows that yield none. */
export interface IRegistryExport {
	/** Entries as the registry file lists them (`toIndexEntry`). */
	readonly entries: readonly Readonly<Record<string, unknown>>[];
	readonly errors: readonly string[];
}

/** A registry entry, or why the frontmatter cannot make one. */
export type IRegistryEntryOutcome =
	| { readonly ok: true; readonly entry: IProposalEntry }
	| {
			readonly ok: false;
			readonly reason: 'invalid_frontmatter_shape' | 'invalid_status';
			readonly detail: string;
	  };
