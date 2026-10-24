import type { IIssueExec } from './reporter.interface';

/** Stable ids so a caller (e.g. `delendai doctor --deep error-reporting`,
 * once wired) can key off a specific check without string-matching text. */
export const SELF_TEST_CHECK_IDS = [
	'plugin-loaded',
	'hook-registered',
	'synthetic-failure-observed',
	'classification-pipeline-working',
	'privacy-validation-working',
	'report-store-writable',
	'gh-installed',
	'gh-authenticated',
	'target-repo-reachable',
	'issue-create-permission-available',
] as const;

export type ISelfTestCheckId = (typeof SELF_TEST_CHECK_IDS)[number];

export interface ISelfTestCheck {
	readonly id: ISelfTestCheckId;
	readonly ok: boolean;
	/** Human-readable reason, present only on failure or when skipped. */
	readonly detail?: string;
	/** True when `live` was false and this check needs real `gh` I/O. */
	readonly skipped?: boolean;
}

export interface ISelfTestResult {
	readonly ok: boolean;
	readonly checks: readonly ISelfTestCheck[];
}

export interface IRunErrorReportingSelfTestInput {
	/** The exact handler wired to `onToolCall` in production — proves
	 * "hook registered" by being a live reference, not a re-implementation. */
	readonly reportObservedFailure: (
		toolName: string,
		result: unknown,
		error: unknown,
	) => Promise<void>;
	/** Absolute directory the store-writable probe writes into; the
	 * plugin's own `pluginCacheDir`, never the host project. */
	readonly probeDirAbs: string;
	readonly targetRepo: string;
	/** When true, also runs the four `gh` checks (installed, authenticated,
	 * repo reachable, issue-create permission) via read-only subcommands.
	 * Off by default so a routine self-test never spawns a process or
	 * touches the network — see `delendai doctor --deep error-reporting --live`. */
	readonly live?: boolean;
	/** Injected exec seam so `gh` can be faked in tests. Defaults to the
	 * real `gh` adapter. Never invoked with `issue create` — the self-test
	 * only issues read-only subcommands (`--version`, `auth status`,
	 * `repo view`, `api`). */
	readonly exec?: IIssueExec;
}
