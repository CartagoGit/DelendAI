// schemas: the Zod schemas used by the bootstrap tool surface.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// schema shape that travels across the MCP wire. It does not know
// about the server-plan computation, the drift store, or the
// scaffold generators — those produce/consume the schemas.
//
// SOLID — Interface Segregation. Each tool surface (analyze, plan,
// create, drift) has its own input schema; the public `*_SCHEMA`
// exports are the *output* schemas the SDK validates against. New
// tools should add their schema here, not in `bootstrap-tool.ts`.

import { z } from 'zod';

// r00002 S1 — mirrors `IProjectAnalysis` (analyze-project.ts).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const PROJECT_ANALYSIS_SCHEMA = z.object({
	hasPackageJson: z.boolean(),
	name: z.string().optional(),
	projectType: z.enum([
		'library',
		'cli',
		'webapp',
		'game',
		'monorepo',
		'generic',
	]),
	language: z.enum([
		'typescript',
		'javascript',
		'python',
		'go',
		'rust',
		'unknown',
	]),
	packageManager: z.enum(['bun', 'pnpm', 'yarn', 'npm', 'unknown']),
	framework: z.string().optional(),
	testRunner: z.enum(['vitest', 'jest', 'bun', 'node', 'unknown']),
	monorepoTool: z.string().optional(),
	hasMcpProject: z.boolean(),
	mcpEvidence: z.array(z.string()),
	ci: z.array(z.string()),
	agentConfigs: z.array(z.string()),
	scripts: z.record(z.string(), z.string()),
	signals: z.array(z.string()),
});

// r00002 S1 — mirrors `IServerPlan` (recommend-plan.ts).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const SERVER_PLAN_SCHEMA = z.object({
	projectType: PROJECT_ANALYSIS_SCHEMA.shape.projectType,
	serverName: z.string(),
	namespacePrefix: z.string(),
	plugins: z.array(z.string()),
	tools: z.array(z.object({ name: z.string(), description: z.string() })),
	validationCommands: z.record(z.string(), z.string()),
	cacheDir: z.string(),
	docsDir: z.string(),
	mcpJson: z.record(z.string(), z.unknown()),
	notes: z.array(z.string()),
});

// r00002 S1 — mirrors `IScaffoldedFile` (scaffold-host.ts).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const SCAFFOLDED_FILE_SCHEMA = z.object({
	path: z.string(),
	content: z.string(),
});

// r00002 S1 — mirrors `IServerBlueprint` (build-blueprint.ts), the
// EXHAUSTIVE plan `plan_mcp_project` returns alongside the files to write.
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const BLUEPRINT_ARTIFACT_SCHEMA = z.object({
	name: z.string(),
	description: z.string(),
});

// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const SERVER_BLUEPRINT_SCHEMA = z.object({
	serverName: z.string(),
	namespacePrefix: z.string(),
	projectType: PROJECT_ANALYSIS_SCHEMA.shape.projectType,
	plugins: z.array(z.string()),
	tools: z.array(BLUEPRINT_ARTIFACT_SCHEMA),
	prompts: z.array(BLUEPRINT_ARTIFACT_SCHEMA),
	skills: z.array(BLUEPRINT_ARTIFACT_SCHEMA),
	agents: z.array(z.object({ slot: z.string(), description: z.string() })),
	tests: z.boolean(),
	hasExistingServer: z.boolean(),
	defaults: z.object({
		keepLegacy: z.boolean(),
		reasons: z.array(z.string()),
		warnings: z.array(z.string()),
	}),
	notes: z.array(z.string()),
});

// r00002 S1 — `create_project`'s output: a dry-run skeleton of files to
// write, discriminated by what was scaffolded (host/plugin/client).
// r00001 S0 — exported so the golden snapshot test can pin the schema shape.
export const MCP_PROJECT_SKELETON_SCHEMA = z.object({
	kind: z.enum(['host', 'plugin', 'client']),
	files: z.array(SCAFFOLDED_FILE_SCHEMA),
});

// f00051 S3 — `drift_check` output schema. Mirrors `IDriftReport` (drift.ts).
export const DRIFT_REPORT_SCHEMA = z.object({
	hasDrift: z.boolean(),
	changes: z.array(
		z.object({
			kind: z.enum([
				'script-added',
				'script-dropped',
				'framework-changed',
				'language-changed',
				'monorepo-changed',
				'package-manager-changed',
				'test-runner-changed',
				'mcp-server-added',
				'mcp-server-dropped',
				'ci-changed',
				'agent-config-changed',
			]),
			summary: z.string(),
		}),
	),
	isFirstSnapshot: z.boolean(),
	lastSnapshotAt: z.string().nullable(),
	summary: z.string(),
});

// -------------------------------------------------------------------
// Input schemas (per-tool, kept here so the wire contract is in one
// place and the tool modules can import them by name).
// -------------------------------------------------------------------

export const ANALYZE_INPUT_SCHEMA = z.object({
	serverName: z.string().optional(),
	namespacePrefix: z.string().optional(),
	cacheDir: z.string().optional(),
	docsDir: z.string().optional(),
});

export const CREATE_INPUT_SCHEMA = z.object({
	kind: z
		.enum(['host', 'plugin', 'client'])
		.optional()
		.describe('What to scaffold.'),
	projectName: z.string().optional(),
	namespacePrefix: z.string().optional(),
	projectPackageName: z.string().optional(),
	pluginName: z.string().optional().describe('Plugin id (kind "plugin").'),
	clientName: z.string().optional().describe('Client id (kind "client").'),
	description: z.string().optional(),
});

export const PLAN_INPUT_SCHEMA = z.object({
	tests: z.boolean().optional(),
	namespacePrefix: z.string().optional(),
	serverName: z.string().optional(),
});

export const DRIFT_INPUT_SCHEMA = z.object({
	persist: z
		.boolean()
		.optional()
		.describe(
			'Default true: write the new analysis as the new baseline. Pass false to peek without updating.',
		),
});
