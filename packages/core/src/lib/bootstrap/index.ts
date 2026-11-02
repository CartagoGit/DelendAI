export { analyzeProject } from './analyze-project';
export type {
	IFileReader,
	IProjectAnalysis,
	IProjectLanguage,
	IProjectType,
} from './analyze-project';
export { PROJECT_PATTERN_CATALOG } from './pattern-catalog';
export type { IProjectPattern, IRecommendedTool } from './pattern-catalog';
export { resolvePatternCatalog } from './pattern-catalog-overrides';
export type { IPatternOverrides } from './pattern-catalog-overrides';
export { recommendServerPlan } from './recommend-plan';
export type { IServerPlan, IServerPlanOptions } from './recommend-plan';
export {
	buildServerBlueprint,
	buildBlueprintFiles,
} from './build-blueprint';
export type {
	IServerBlueprint,
	IBlueprintArtifact,
	IBlueprintOptions,
} from './build-blueprint';
// capability-diff: public surface stays backward compatible
// (ICapabilityDiff / IReasonedEntry / IToolName) but the
// implementation is now composed of focused modules.
export {
	diffCapabilities,
	existingToolsFromAnalysis,
	// Strategies re-exported so consumers have a single import surface.
	CompositeAliasStrategy,
	DefaultAliasStrategy,
	DefaultExistingToolsMatcher,
	StaticExistingToolsSource,
	buildCapabilityViews,
	formatCoverageSummary,
} from './capability-diff';
export type {
	ICapabilityDiff,
	IReasonedEntry,
	IToolName,
	// Strategy interfaces.
	IAliasStrategy,
	IAliasContext,
	IExistingToolsMatcher,
	IToolClassification,
	IClassificationContext,
	// Source interface.
	IExistingToolsSource,
	// View interfaces (segregated).
	ICapabilityDiffViews,
	IPresentView,
	IMissingView,
	IMismatchedView,
	IExtraView,
	IDesiredView,
	IBuildViewsInput,
} from './capability-diff';
// Sub-module types that the diff re-exports would shadow.
export type { IStaticSourceOptions } from './existing-tools-source';
export type { ICanonicalToolId } from './capability-normalize';
export {
	diffAnalysis,
	DEFAULT_DRIFT_DETECTORS,
} from './drift';
export type {
	IDriftChange,
	IDriftReport,
	IDiffAnalysisOptions,
} from './drift';
export type {
	IDriftDetector,
	IDriftDetectorContext,
} from './drift-detector';
export { formatSetDiff, sameStrings } from './drift-detector';
export { ScriptsDriftDetector } from './scripts-drift-detector';
export { StackDriftDetector } from './stack-drift-detector';
export { MetadataDriftDetector } from './metadata-drift-detector';
export {
	DRIFT_STORE_VERSION,
	loadDriftSnapshot,
	saveDriftSnapshot,
} from './drift-store';
export type {
	IDriftSnapshotEnvelope,
	ILoadDriftSnapshotResult,
} from './drift-store';
export {
	blueprintArtifactBody,
	continueProposalPromptBody,
	fixQualityPromptBody,
	frameworkSkillBody,
	frameworkSkillWhenToUse,
	projectStandardsSkillBody,
	startPromptBody,
	formatList,
	formatScripts,
	frameworkHintsFor,
	languageHintsFor,
} from './body-content';
export { buildBootstrapToolRegistrations } from './bootstrap-tool';
export type { IBootstrapToolOptions } from './bootstrap-tool';
export { createWorkspaceFileReader } from './workspace-file-reader';
// Per-tool modules: each one is independently importable so hosts
// can register only the tools they want.
export { buildAnalyzeToolRegistration } from './analyze-tool';
export type { IAnalyzeToolDeps } from './analyze-tool';
export { buildPlanToolRegistration } from './plan-tool';
export type { IPlanToolDeps } from './plan-tool';
export { buildCreateToolRegistration } from './create-tool';
export type { ICreateToolDeps } from './create-tool';
export { buildDriftCheckToolRegistration } from './drift-check-tool';
export type { IDriftCheckToolDeps } from './drift-check-tool';
// Schemas: the wire contract in one place.
export {
	PROJECT_ANALYSIS_SCHEMA,
	SERVER_PLAN_SCHEMA,
	SCAFFOLDED_FILE_SCHEMA,
	BLUEPRINT_ARTIFACT_SCHEMA,
	SERVER_BLUEPRINT_SCHEMA,
	MCP_PROJECT_SKELETON_SCHEMA,
	DRIFT_REPORT_SCHEMA,
	ANALYZE_INPUT_SCHEMA,
	CREATE_INPUT_SCHEMA,
	PLAN_INPUT_SCHEMA,
	DRIFT_INPUT_SCHEMA,
} from './schemas';
