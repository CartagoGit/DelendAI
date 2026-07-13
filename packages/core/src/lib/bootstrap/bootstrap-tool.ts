import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IFileReader } from './analyze-project';
import { buildAnalyzeToolRegistration } from './analyze-tool';
import { buildCreateToolRegistration } from './create-tool';
import { buildDriftCheckToolRegistration } from './drift-check-tool';
import type { IPatternOverrides } from './pattern-catalog-overrides';
import { buildPlanToolRegistration } from './plan-tool';
import { createWorkspaceFileReader } from './workspace-file-reader';

export interface IBootstrapToolOptions {
	readonly workspace: IWorkspacePathProvider;
	readonly namespacePrefix: string;
	readonly cacheDir?: string;
	readonly reader?: IFileReader;
	readonly patternOverrides?: IPatternOverrides;
}

// Backwards-compatible schema exports. The split per-tool modules and this
// aggregate facade now consume the same canonical wire contracts.
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
export { createWorkspaceFileReader } from './workspace-file-reader';

/**
 * Aggregate the four independently testable bootstrap registrations used by
 * the production host. Keeping this as composition prevents the facade from
 * drifting into a second implementation of analyze/plan/create/drift.
 */
export const buildBootstrapToolRegistrations = (
	options: IBootstrapToolOptions,
): readonly IToolRegistration[] => {
	const reader =
		options.reader ?? createWorkspaceFileReader(options.workspace);
	const patternOverrides =
		options.patternOverrides === undefined
			? {}
			: { patternOverrides: options.patternOverrides };
	return [
		buildAnalyzeToolRegistration({
			namespacePrefix: options.namespacePrefix,
			reader,
			...patternOverrides,
		}),
		buildPlanToolRegistration({
			namespacePrefix: options.namespacePrefix,
			reader,
			...patternOverrides,
		}),
		buildCreateToolRegistration({
			namespacePrefix: options.namespacePrefix,
		}),
		buildDriftCheckToolRegistration({
			namespacePrefix: options.namespacePrefix,
			reader,
			workspace: options.workspace,
			...(options.cacheDir === undefined
				? {}
				: { cacheDir: options.cacheDir }),
		}),
	];
};
