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
// (ICapabilityDiff / ICapabilityDiffEntry / IToolName) but the
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
	ICapabilityDiffEntry,
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
export {
	buildBootstrapToolRegistrations,
	createWorkspaceFileReader,
} from './bootstrap-tool';
export type { IBootstrapToolOptions } from './bootstrap-tool';
