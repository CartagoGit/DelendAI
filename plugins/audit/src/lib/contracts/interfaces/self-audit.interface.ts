import type {
	FindingSeverity,
	IAggregatedScan,
	IScanResult,
} from '@delendai/core/public';

export interface ISelfAuditScannerRef {
	/** Stable id, e.g. "security", "deps", "perf". */
	readonly id: string;
	/** Human-readable display name. */
	readonly label: string;
	/** Capability tag, e.g. "security" | "perf" | "deps". */
	readonly capability: string;
}

/** A scanner runner the host injects. */
export type ISelfAuditScannerRunner = (
	workspaceRootAbs: string,
) => Promise<IScanResult>;

export interface ISelfAuditReport {
	/** ISO timestamp the report was assembled. */
	readonly ranAt: string;
	/** Total scanners registered (whether they ran or were skipped). */
	readonly scannerCount: number;
	/** Scanners that returned a skipped result. */
	readonly skipped: readonly { id: string; note?: string }[];
	/** Aggregated scan result (sorted findings, summary, worst band). */
	readonly aggregated: IAggregatedScan;
	/** Worst severity band across the aggregated findings. */
	readonly worst: FindingSeverity | 'none';
	/** Per-capability counts of how many scanners ran. */
	readonly capabilities: Readonly<Record<string, number>>;
}

export interface ISelfAuditOptions {
	readonly workspaceRootAbs: string;
	/**
	 * Injected map of scanner-id to runner. Defaults to an empty map
	 * (the audit is a no-op aggregation in that case).
	 */
	readonly scanners?: ReadonlyMap<
		string,
		{
			readonly ref: ISelfAuditScannerRef;
			readonly run: ISelfAuditScannerRunner;
		}
	>;
}
