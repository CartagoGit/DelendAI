/**
 * Public surface of `@delendai/env`. Pure `.env` parsing + validation
 * primitives for programmatic reuse.
 */
export { checkEnv, parseEnv, runEnvCheck } from '../lib/env/check-env';
export { realEnvDeps } from '../lib/env/real-deps';
export {
	buildSchemaFromRequirements,
	loadRequirementsFromPluginNames,
} from '../lib/requirements/derive';
export { explain } from '../lib/requirements/explain';
export { extractRequirements } from '../lib/requirements/extract';
export { checkSchema } from '../lib/validate/check-schema';
export {
	ENV_SCHEMA,
	schemaKeys,
	schemaRequired,
} from '../lib/validate/env-schema';
export type {
	IEnvCheckToolOptions,
	IEnvEntry,
	IEnvScanDeps,
	IParsedEnv,
} from '../lib/contracts/interfaces/env.interface';
export type {
	IBlockedCapability,
	IEnvExplain,
	IEnvRequirement,
	IUnlockedCapability,
} from '../lib/requirements/types';
export type {
	EnvType,
	IEnvSchema,
	IEnvVarSchema,
} from '../lib/validate/env-schema';
