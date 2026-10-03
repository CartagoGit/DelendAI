/**
 * close-slice-gate.interface.ts — the shapes of the `close_slice` gate run.
 */

/** How a gate run stands: green, red, still running, or without a verdict. */
export type ICloseGateState = 'pass' | 'fail' | 'pending' | 'unverifiable';

/** One gate the project declares: where it was declared, and what runs. */
export interface ICloseGateStep {
	readonly scope: string;
	readonly command: string;
}

/** What was started: enough to resume, time out or report the run. */
export interface ICloseGateJob {
	readonly handle: string;
	readonly tree: string;
	readonly steps: readonly ICloseGateStep[];
	readonly cwd: string;
	readonly startedAtMs: number;
	readonly timeoutMs: number;
	readonly pid: number;
}

/** The only verdict that outlives its report. */
export interface ICloseGateGreenVerdict {
	readonly tree: string;
	readonly steps: number;
	readonly passedAt: string;
}

export interface ICloseGateProgress {
	/** The runner reached its end marker (whatever the exit codes say). */
	readonly finished: boolean;
	/** One exit code per step that ran, in order. */
	readonly exitCodes: readonly number[];
}

/** Where an existing certification of the slice's exact tree came from. */
export type ICloseGateCertifiedBy =
	| 'forge-check'
	| 'landing-certification'
	| 'recorded-gate';

/**
 * What already certifies (or condemns) the slice's tree, before any gate
 * is run: `certified` closes without running, `failed` blocks with the
 * failing check, `none` says what is missing and how to get it.
 */
export type ICloseGateCertification =
	| {
			readonly state: 'certified';
			readonly source: Exclude<ICloseGateCertifiedBy, 'recorded-gate'>;
			readonly evidence: string;
	  }
	| {
			readonly state: 'failed';
			readonly check: string;
			readonly evidence: string;
			readonly nextAction: string;
	  }
	| {
			readonly state: 'none';
			readonly missing: readonly string[];
			readonly nextAction: string;
	  };

/** Looks for a certification of one tree; never runs a gate. */
export type ICloseGateCertificationReader = (
	tree: string,
) => Promise<ICloseGateCertification>;

export interface ICloseGateVerdict {
	readonly state: ICloseGateState;
	/** Which existing evidence answered, when one did instead of a run. */
	readonly certifiedBy?: ICloseGateCertifiedBy;
	/** The commit/check or record that certified the tree. */
	readonly evidence?: string;
	/** What is missing and how to get it, when the slice cannot close yet. */
	readonly nextAction?: string;
	/** Names the run; absent when no run could be identified. */
	readonly handle?: string;
	readonly tree?: string;
	/** True when a recorded green result for this tree answered. */
	readonly reused: boolean;
	/** Why the gate is not green; empty on a pass. */
	readonly findings: readonly string[];
}

/** The detached process a gate run lives in. */
export interface ICloseGateProcessPort {
	/** Start the runner detached; the pid of its process group leader. */
	readonly start: (runner: string, cwd: string) => number | undefined;
	readonly isAlive: (pid: number) => boolean;
	readonly killGroup: (pid: number) => void;
}

export interface ICloseGateDeps {
	/** Directory that holds the runs (shared by every checkout). */
	readonly storeRoot: string;
	/**
	 * Directories holding the host's own state (absolute). They change while
	 * a slice is worked on, so they are not part of the tree a result is
	 * keyed by. Defaults to the store itself.
	 */
	readonly stateRoots?: readonly string[];
	/** The checkout whose content is being certified and where the gate runs. */
	readonly cwd: string;
	/** Reads one declaration file (relative path) of the integration head. */
	readonly readDeclaration: (relativePath: string) => Promise<string | null>;
	/** Looks for a certification of the tree before a gate is run. */
	readonly certification?: ICloseGateCertificationReader;
	/** Local gates allowed to run at once on this machine (default 1). */
	readonly maxConcurrentGates?: number;
	readonly waitMs?: number;
	readonly timeoutMs?: number;
	readonly process?: ICloseGateProcessPort;
	readonly fingerprint?: (
		cwd: string,
		excludedPaths: readonly string[],
		scratchRoot: string,
	) => Promise<string | undefined>;
	readonly now?: () => number;
	readonly sleep?: (ms: number) => Promise<void>;
}

/** Which way the declared gate answered, and the run it belongs to. */
export interface ICloseSliceGateReport {
	readonly state: ICloseGateState;
	readonly reused: boolean;
	readonly handle?: string;
	readonly tree?: string;
	readonly certifiedBy?: ICloseGateCertifiedBy;
	readonly evidence?: string;
	readonly nextAction?: string;
}

/** What the quality probe reports back to `close_slice`. */
export interface ICloseSliceQualityResult {
	readonly ok: boolean;
	readonly severity: 'ok' | 'error';
	readonly findings: readonly string[];
	readonly summary?: {
		readonly ok: boolean;
		readonly scopes: number;
	};
	readonly gate?: ICloseSliceGateReport;
}

/** What the reader asks of git, the forge's CLI and the disk. */
export interface ICertificationPorts {
	/** Git's trimmed output in the checkout, or `undefined` on failure. */
	readonly git: (args: readonly string[]) => string | undefined;
	/** The forge CLI's trimmed output in the checkout, or `undefined`. */
	readonly gh: (args: readonly string[]) => string | undefined;
	/** A file's text, or `undefined` when it is not there. */
	readonly readFile: (path: string) => Promise<string | undefined>;
}
