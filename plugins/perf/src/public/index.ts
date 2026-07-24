/**
 * Public surface of `@mcp-vertex/perf`. Pure bundle-size budgeting primitives
 * for programmatic reuse.
 */
export {
	checkBudgets,
	formatBytes,
	totalBytes,
} from '../lib/perf/check-budgets';
export { realPerfDeps } from '../lib/perf/real-deps';
export type {
	IFileSize,
	IPerfBudgets,
	IPerfBundleToolOptions,
	IPerfScanDeps,
} from '../lib/contracts/interfaces/perf.interface';
