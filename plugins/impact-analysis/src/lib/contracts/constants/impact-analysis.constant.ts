import { TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export const IMPACT_ANALYSIS_DEPENDS_ON = [
	'git',
	'search',
	'refactor',
	'test-policy',
] as const;

export const DEFAULT_IMPACT_ANALYSIS_MAX_BYTES =
	TOKEN_BUDGETS.toolPayloads.search.hard;

export const IMPACT_ANALYSIS_SOURCE_EXTENSIONS = [
	'ts',
	'tsx',
	'js',
	'jsx',
	'mjs',
	'cjs',
] as const;

export const IMPACT_ANALYSIS_TEST_FILE_RE =
	/(?:^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/u;

export const IMPACT_ANALYSIS_SEARCH_ROOTS = [
	'packages',
	'plugins',
	'apps',
	'tools',
	'extensions',
] as const;

export const MAX_IMPACT_ANALYSIS_FILES = 12;
export const MAX_IMPACT_ANALYSIS_SYMBOLS = 12;
export const MAX_IMPACT_ANALYSIS_DEPENDENTS = 20;
export const MAX_IMPACT_ANALYSIS_RECOMMENDED_TESTS = 12;
export const MAX_IMPACT_ANALYSIS_SKIP_TESTS = 6;
export const MAX_IMPACT_ANALYSIS_ALL_TEST_SCAN_RESULTS = 80;
export const IMPACT_ANALYSIS_SEARCH_MAX_RESULTS = 60;
export const HIGH_RISK_DEPENDENTS_THRESHOLD = 10;
export const HIGH_RISK_AFFECTED_PACKAGES_THRESHOLD = 3;
export const MEDIUM_RISK_DEPENDENTS_THRESHOLD = 1;
