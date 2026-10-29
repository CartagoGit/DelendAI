/**
 * audit-findings.interface.ts — an audit's findings, and how a plan's
 * ledger settles each one (f00764).
 */

/** One finding, as its audit records it. */
export interface IAuditFinding {
	/** `G12`, `D3` — unique within its audit. */
	readonly id: string;
	readonly title: string;
	/** `CONFIRMADO`, `PARCIAL`… as the audit writes it. */
	readonly classification?: string;
	readonly zone?: string;
	readonly evidence?: string;
	/** The reviewers who saw it, without their notes. */
	readonly seenBy: readonly string[];
}

export interface IAuditFindings {
	readonly findings: readonly IAuditFinding[];
	/** Findings that name no evidence: reported, never settled by default. */
	readonly withoutEvidence: readonly string[];
}

/** How a ledger settles one finding. */
export type ILedgerSettlement =
	| { readonly kind: 'settled-by'; readonly proposals: readonly string[] }
	| { readonly kind: 'same-as'; readonly finding: string }
	| { readonly kind: 'rejected'; readonly reason: string };

/** One ledger row: `<audit>/<finding>`, its settlement and the agreement it reached. */
export interface ILedgerEntry {
	readonly finding: string;
	readonly settlement: ILedgerSettlement;
	readonly confirmed: readonly string[];
	readonly disputed: readonly string[];
	/** The plan's consensus threshold, when the row states it. */
	readonly threshold?: number;
}

/** A finding a plan cannot close over yet. */
export interface IOpenAuditFinding {
	readonly ref: string;
	readonly reason: 'unsettled' | 'settling-proposal-open';
	/** The settling proposals not done yet. */
	readonly pending?: readonly string[];
}

/** What a plan's closure reads of the audits it contains. */
export interface IPlanAudits {
	/** Each contained audit's findings, by audit id. */
	readonly findingsByAudit: ReadonlyMap<string, readonly IAuditFinding[]>;
	readonly ledger: readonly ILedgerEntry[];
}
