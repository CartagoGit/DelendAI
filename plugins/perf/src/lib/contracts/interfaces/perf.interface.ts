/**
 * perf.interface.ts — types for the perf plugin's bundle-size budgets. Kept
 * under contracts/interfaces per the types-in-contracts convention.
 */
import type {
	FindingSeverity,
	IProbeDeps,
	IToolProbeResult,
} from '@delendai/core/public';

/** One measured file and its size in bytes. */
export interface IFileSize {
	readonly path: string;
	readonly bytes: number;
}

/** Size budgets, in bytes. Absent fields mean "no budget for this axis". */
export interface IPerfBudgets {
	/** Max bytes any single matched file may reach. */
	readonly maxFileBytes?: number;
	/** Max bytes the matched files may total. */
	readonly maxTotalBytes?: number;
}

/** Injected I/O seam so the check is unit-testable without a filesystem. */
export interface IPerfScanDeps {
	/** Return the size of every file matching any of the globs. */
	readonly listSizes: (
		globs: readonly string[],
	) => Promise<readonly IFileSize[]>;
}

/** Options for the `perf_bundle` tool builder. */
export interface IPerfBundleToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Injectable sizer for tests; production reads the filesystem. */
	readonly deps?: IPerfScanDeps;
}

/** One normalized hotspot extracted from profiler output. */
export interface IHotspot {
	readonly name: string;
	readonly message: string;
	readonly severity: FindingSeverity;
	readonly selfPercent: number;
	readonly totalPercent: number;
	readonly samples: number;
}

/** Supported profiling output modes. */
export type PerfProfileFormat = 'hotspots' | 'flamegraph';

/** Normalized profile-capture input after defaults are applied. */
export interface IPerfProfileCaptureInput {
	readonly cwd: string;
	readonly timeoutMs: number;
	readonly format: PerfProfileFormat;
}

/** Raw execution result from one profiler backend. */
export interface IPerfProfileExecution {
	readonly ok: boolean;
	readonly profiler: string;
	readonly report?: string;
	readonly code: number;
	readonly timedOut: boolean;
	readonly detail?: string;
}

/** Pure result shape consumed by the tool wrapper. */
export type IPerfProfileCaptureResult =
	| {
			readonly ok: true;
			readonly profiler: string;
			readonly hotspots: readonly IHotspot[];
	  }
	| {
			readonly ok: 'skipped';
			readonly hint: string;
	  }
	| {
			readonly ok: false;
			readonly code:
				| 'profiler-failed'
				| 'profile-empty'
				| 'profile-unparseable';
			readonly message: string;
			readonly hint?: string;
	  };

/** Injectable deps for profiling capture and real host probing. */
export interface IPerfProfileDeps {
	readonly probeProfilers: (
		format: PerfProfileFormat,
	) => Promise<readonly IToolProbeResult[]>;
	readonly runProfiler: (
		profilerId: string,
		input: IPerfProfileCaptureInput,
	) => Promise<IPerfProfileExecution>;
}

/** Optional seams for the production deps adapter tests. */
export interface IRealPerfProfileDepsOptions {
	readonly probeDeps?: IProbeDeps;
	/** Override the scratch root (defaults to `<workspaceRootAbs>/.cache/delendai`). */
	readonly pluginCacheDir?: string;
}

/** Options for the `perf_profile` tool builder. */
export interface IPerfProfileToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly deps?: IPerfProfileDeps;
	readonly runProfileCapture?: (
		input: IPerfProfileCaptureInput,
		deps: IPerfProfileDeps,
	) => Promise<IPerfProfileCaptureResult>;
	/** Forwarded to the production deps as the scratch root. */
	readonly pluginCacheDir?: string;
}
