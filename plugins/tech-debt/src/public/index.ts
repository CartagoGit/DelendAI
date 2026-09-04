/**
 * Public surface of `@delendai/tech-debt`. Pure marker-scanning primitives
 * for programmatic reuse.
 */
export { scanFile, scanMarkers } from '../lib/tech-debt/scan-markers';
export { realTechDebtDeps } from '../lib/tech-debt/real-deps';
export type {
	ISourceFile,
	ITechDebtScanDeps,
	ITechDebtScanToolOptions,
} from '../lib/contracts/interfaces/tech-debt.interface';
