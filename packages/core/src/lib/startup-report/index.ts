export {
	buildStartupReport,
	reconcileCatalogVsPlugins,
	type IStartupReport,
	type IStartupReportBaseline,
	type IStartupReportBudget,
	type IStartupReportCatalogCounts,
	type IStartupReportInput,
	type IStartupReportManagedRuntime,
	type IStartupReportServerIdentity,
	type IStartupReportWarning,
} from './model';
export {
	coerceStartupReportLevel,
	levelIncludesPluginCostTable,
	resolveStartupReportLevel,
	resolveStartupReportLevelAlias,
	STARTUP_REPORT_DEFAULT_LEVEL,
	STARTUP_REPORT_LEVELS,
	STARTUP_REPORT_LEVEL_INPUTS,
	type IResolveStartupReportLevelInput,
	type IResolveStartupReportLevelResult,
	type IStartupReportLevel,
	type IStartupReportLevelInput,
} from './level';
export { isStartupReportLevelVisible } from './level';
export {
	renderStartupReport,
	renderStartupReportAnsi,
	renderStartupReportPlain,
	shouldUseAnsiColors,
} from './renderer';
