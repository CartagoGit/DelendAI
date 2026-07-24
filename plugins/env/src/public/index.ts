/**
 * Public surface of `@mcp-vertex/env`. Pure `.env` parsing + validation
 * primitives for programmatic reuse.
 */
export { checkEnv, parseEnv, runEnvCheck } from '../lib/env/check-env';
export { realEnvDeps } from '../lib/env/real-deps';
export type {
	IEnvCheckToolOptions,
	IEnvEntry,
	IEnvScanDeps,
	IParsedEnv,
} from '../lib/contracts/interfaces/env.interface';
