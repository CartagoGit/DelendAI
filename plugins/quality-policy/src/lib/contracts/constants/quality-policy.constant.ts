import { QUALITY_POLICY_AREAS } from '../interfaces/quality-policy.interface';

export { QUALITY_POLICY_AREAS };

export const QUALITY_POLICY_DEPENDS_ON = [
	'@mcp-vertex/quality',
	'@mcp-vertex/rules',
	'@mcp-vertex/test-policy',
	'@mcp-vertex/test-convention',
	'@mcp-vertex/conventions',
] as const;

export const DEFAULT_QUALITY_POLICY_MAX_BYTES = 2000;
export const QUALITY_POLICY_SAMPLE_ROOTS = [
	'packages',
	'plugins',
	'apps',
	'tools',
] as const;
export const QUALITY_POLICY_SAMPLE_LIMIT = 8;
export const QUALITY_POLICY_TYPESCRIPT_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.mts',
	'.cts',
]);
export const QUALITY_POLICY_LINT_AREAS = [
	'root',
	'packages/core',
	'apps/web',
] as const;
