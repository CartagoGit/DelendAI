/**
 * Public surface of `@delendai/perf`. Pure bundle-size budgeting primitives
 * and profile capture primitives for programmatic reuse.
 */
export {
	checkBudgets,
	formatBytes,
	totalBytes,
} from '../lib/perf/check-budgets';
export { realPerfDeps } from '../lib/perf/real-deps';
export { realPerfProfileDeps } from '../lib/profile/real-perf-profile-deps';
export { runProfileCapture } from '../lib/profile/run-profile-capture';
export type {
	IFileSize,
	IHotspot,
	IPerfBudgets,
	IPerfBundleToolOptions,
	IPerfProfileCaptureInput,
	IPerfProfileCaptureResult,
	IPerfProfileDeps,
	IPerfProfileToolOptions,
	IPerfScanDeps,
	PerfProfileFormat,
} from '../lib/contracts/interfaces/perf.interface';
