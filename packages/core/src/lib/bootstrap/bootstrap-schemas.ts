/**
 * Backwards-compatible schema import path. Canonical contracts live in
 * `schemas.ts`; this module deliberately contains no parallel definitions.
 */
export {
	ANALYZE_INPUT_SCHEMA as ANALYZE_SCHEMA,
	BLUEPRINT_ARTIFACT_SCHEMA,
	CREATE_INPUT_SCHEMA as CREATE_SCHEMA,
	DRIFT_REPORT_SCHEMA,
	MCP_PROJECT_SKELETON_SCHEMA,
	PROJECT_ANALYSIS_SCHEMA,
	SCAFFOLDED_FILE_SCHEMA,
	SERVER_BLUEPRINT_SCHEMA,
	SERVER_PLAN_SCHEMA,
} from './schemas';
