/**
 * Public surface of `@mcp-vertex/security`. Pure, reusable secret-scanning
 * primitives for consumers that want to run the scan directly (e.g. the
 * self-audit aggregator).
 */
export { scanSecrets } from '../lib/secrets/scan-secrets';
export { runSecretScan } from '../lib/secrets/run-scan';
export { realScanDeps } from '../lib/secrets/real-deps';
export { SECRET_RULES } from '../lib/contracts/constants/secret-rules.constant';
export type {
	ISecretRule,
	ISecretScanDeps,
	ISecretScanFile,
	ISecretScanOutcome,
} from '../lib/contracts/interfaces/secrets.interface';
