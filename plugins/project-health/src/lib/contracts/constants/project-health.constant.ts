export const DEFAULT_PROJECT_HEALTH_MAX_BYTES = 2000;

export const PROJECT_HEALTH_DOMAIN_TOOLS = {
	security: 'security_secrets_scan',
	deps: 'deps_audit',
	quality: 'quality_run',
	debt: 'tech_debt_scan',
} as const;

export const PROJECT_HEALTH_DEPENDS_ON = [
	'quality',
	'security',
	'deps',
	'tech-debt',
] as const;

export const PROJECT_HEALTH_SAMPLE_ROOTS = [
	'packages',
	'plugins',
	'apps',
	'tools',
	'extensions',
] as const;

export const PROJECT_HEALTH_IGNORE_DIRS = new Set([
	'node_modules',
	'.git',
	'.cache',
	'dist',
	'build',
	'coverage',
	'docs-api',
	'public',
]);

export const PROJECT_HEALTH_SAMPLE_FILE_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.md',
	'.mdx',
	'.astro',
	'.py',
	'.go',
	'.rs',
	'.json',
	'.yml',
	'.yaml',
	'.sh',
]);

export const PROJECT_HEALTH_MAX_MARKER_FILES = 50;
export const PROJECT_HEALTH_MAX_SECURITY_PATHS = 200;
export const PROJECT_HEALTH_MAX_HINT_LENGTH = 220;
export const PROJECT_HEALTH_MARKER_CONTENT_LIMIT = 20_000;
export const PROJECT_HEALTH_DEFAULT_SECURITY_SCORE = 90;
export const PROJECT_HEALTH_SECURITY_PATH_PENALTY = 15;
/**
 * The most a summary axis can score. Every axis here is a heuristic (a
 * lockfile present, configs present, a bounded sample of files), and a
 * heuristic cannot certify perfection: 100 is what a measuring domain
 * tool reports, never this summary.
 */
export const PROJECT_HEALTH_INFERRED_CEILING = 90;
export const PROJECT_HEALTH_WITH_LOCKFILE_SCORE = 90;
export const PROJECT_HEALTH_WITHOUT_LOCKFILE_SCORE = 60;
export const PROJECT_HEALTH_QUALITY_SCOPE_SCORE = 40;
export const PROJECT_HEALTH_QUALITY_CONFIG_SCORE = 30;

export const PROJECT_HEALTH_DEBT_WEIGHTS = {
	high: 6,
	medium: 3,
	low: 1,
	info: 0,
} as const;
