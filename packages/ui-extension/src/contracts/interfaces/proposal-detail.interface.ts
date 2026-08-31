/**
 * `IProposalDetail` + `IProposalDetailCopy` — the host-agnostic
 * contracts consumed by the shared proposal-detail renderer.
 *
 * The shape is structurally identical to the legacy
 * `extensions/vscode/src/lib/proposals-snapshot.ts#IProposalDetail`,
 * but living here lets any host (VS Code, JetBrains, Zed, the docs
 * site preview) project the same view without depending on the
 * extension's snapshot layer. Hosts that already build their own
 * `IProposalDetail` from MCP tools just pass it through; hosts that
 * need to obtain one use the existing `ProposalsSnapshotSource`
 * (still inside the extension today; cross-host-friendly in f00394
 * scope).
 */
export interface IProposalSliceSummary {
	readonly sliceId: string;
	readonly status: string;
	readonly owner: string | null;
}

export interface IProposalSummary {
	readonly id: string;
	readonly status: string;
	readonly slices: readonly IProposalSliceSummary[];
	readonly claimableSliceIds: readonly string[];
}

export interface IProposalLogEvent {
	readonly ts: string;
	readonly kind: string;
	readonly agent: string | null;
	readonly taskId: string | null;
	readonly summary: string;
}

export interface IProposalAgent {
	readonly name: string;
	readonly taskId: string | null;
}

export interface IProposalProgress {
	readonly total: number;
	readonly done: number;
	readonly inProgress: number;
	readonly pending: number;
	readonly percent: number;
	readonly eta?: string;
	readonly etaLabel?: string;
	readonly avgSliceMs?: number;
}

export interface IProposalDetail {
	readonly id: string;
	readonly summary?: IProposalSummary;
	readonly diagnose?: Record<string, unknown>;
	readonly logs: readonly IProposalLogEvent[];
	readonly planMarkdown?: string;
	readonly agents: readonly IProposalAgent[];
	readonly progress: IProposalProgress;
}

/** Minimal, host-agnostic copy for the proposal-detail renderer. */
export interface IProposalDetailCopy {
	readonly lang: string;
	readonly folder: string;
	readonly slices: string;
	readonly slice: string;
	readonly status: string;
	readonly owner: string;
	readonly claimableNow: string;
	readonly lockOwners: string;
	readonly notActionable: string;
	readonly noSlices: string;
	readonly diagnose: string;
	readonly noDiagnosis: string;
	readonly emptyDiagnosis: string;
	readonly logs: string;
	readonly noLogs: string;
	readonly time: string;
	readonly kind: string;
	readonly agent: string;
	readonly summary: string;
	readonly plan: string;
	readonly noPlan: string;
	readonly agents: string;
	readonly noAgents: string;
	readonly progress: string;
	readonly eta: string;
	readonly etaShort: string;
	readonly done: string;
	readonly inProgress: string;
	readonly pending: string;
	readonly slicesWord: string;
}
