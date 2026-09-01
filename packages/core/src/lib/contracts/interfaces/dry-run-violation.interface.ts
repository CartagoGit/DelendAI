/**
 * dry-run-violation.interface.ts — vocabulary for
 * `dry-run/dry-run-violation-log.ts`.
 *
 * A "violation" here is `enforce.ts`'s post-hoc DETECTION path firing:
 * `args.dryRun` was `true` and the handler's return value was not a
 * valid `IDryRunResult` — i.e. the plugin either ignored `dryRun`
 * entirely or returned a malformed plan. By the time this record is
 * built the handler has already run to completion, so this is a
 * forensic trail (S1, r00037), not a prevention mechanism — prevention
 * is the `EffectBroker` (`capabilities/effect-broker.ts`, S2/S3).
 */

/** One issue surfaced by `validateDryRunResult` for a malformed plan. */
export interface IDryRunViolationIssue {
	readonly path: string;
	readonly message: string;
}

/**
 * Audit-trail record for one `dryRun` contract violation, keyed by the
 * plugin/tool responsible so a host can name the offender rather than
 * just "something ignored dryRun".
 */
export interface IDryRunContractViolationRecord {
	readonly ts: string;
	/** The routed tool name the call was dispatched to. */
	readonly tool: string;
	/** `undefined` for core tools that are not owned by a plugin. */
	readonly pluginId: string | undefined;
	readonly reason: string;
	readonly issues: readonly IDryRunViolationIssue[];
}
