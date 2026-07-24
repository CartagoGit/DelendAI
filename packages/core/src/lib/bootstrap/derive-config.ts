/**
 * derive-config.ts — recommend a full `mcp-vertex.config.json` from the
 * live project analysis (f00117 S1).
 *
 * Pure: no I/O. The caller (the `init_config` tool) supplies the
 * analysis plus the real top-level directory names; this module turns
 * them into a concrete config — preset membership expanded into the
 * `plugins` map (the config file has no `preset` field by design; the
 * map IS the resolved selection) — with a one-line rationale per
 * decision so the agent can explain the recommendation.
 */
import type { IProjectAnalysis } from './analyze-project';
import { resolvePresetMembers } from '../plugins/preset-catalog';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';

export interface IDeriveConfigContext {
	/** Real top-level directory names of the workspace (readdir). */
	readonly topLevelDirs: readonly string[];
}

export interface IDerivedConfig {
	/** The preset whose membership seeded the plugins map. */
	readonly preset: 'lean' | 'standard' | 'minimal';
	readonly config: {
		readonly $schema: string;
		readonly cacheDir: string;
		readonly docsDir: string;
		readonly plugins: Readonly<
			Record<string, { readonly options: Record<string, unknown> }>
		>;
	};
	/** One line per decision — the agent-facing "why". */
	readonly rationale: readonly string[];
}

/** Source-ish top-level dirs worth scanning (order = output order). */
const ROOT_CANDIDATES = [
	'packages',
	'plugins',
	'apps',
	'libs',
	'services',
	'src',
	'extensions',
	'tools',
	'docs',
	'e2e',
	'test',
	'tests',
] as const;

/**
 * Filter the workspace's real top-level dirs down to the source-ish
 * candidates worth scanning. Shared by the `init_config` MCP tool and
 * the CLI `init` renderer so BOTH bootstrap paths derive roots from the
 * actual project layout (a00063: `init` used to stamp mcp-vertex's own
 * monorepo roots into every adopter's config — an Angular app got
 * `roots: ["packages", ...]`, none of which existed, so every search
 * silently scanned 0 files). An empty result means "omit roots": the
 * search engine then walks `.` (gitignore- and ignoreDirs-aware), which
 * is correct for any project shape.
 */
export const deriveSourceRoots = (
	topLevelDirs: readonly string[],
): readonly string[] =>
	ROOT_CANDIDATES.filter((dir) => topLevelDirs.includes(dir));

const CONFIG_SCHEMA_URL =
	'https://unpkg.com/@mcp-vertex/core/schema/mcp-vertex.config.schema.json';

const isTsLike = (language: IProjectAnalysis['language']): boolean =>
	language === 'typescript' || language === 'javascript';

/** Derive a concrete config + rationale from the analysis. Pure. */
export const deriveConfig = (
	analysis: IProjectAnalysis,
	context: IDeriveConfigContext,
): IDerivedConfig => {
	const rationale: string[] = [];
	const roots = deriveSourceRoots(context.topLevelDirs);

	let preset: IDerivedConfig['preset'];
	if (!isTsLike(analysis.language)) {
		preset = 'minimal';
		rationale.push(
			`Non-TS language detected (${analysis.language}) — starting minimal (git + search) plus conventions; pass profile: "${analysis.language}" to conventions_check/classify for language-native roles.`,
		);
	} else if (analysis.monorepoTool !== undefined) {
		preset = 'standard';
		rationale.push(
			`TypeScript monorepo (${analysis.monorepoTool}) — the standard single-agent toolkit fits; upgrade to the swarm preset when multiple agents work this repo in parallel.`,
		);
	} else {
		preset = 'lean';
		rationale.push(
			'Single-package TypeScript project — the 4 lean essentials (git, search, memory, docs) keep the token surface small.',
		);
	}

	const members = [...resolvePresetMembers(preset)];
	if (!isTsLike(analysis.language) && !members.includes('conventions')) {
		members.push('conventions');
	}

	const plugins: Record<string, { options: Record<string, unknown> }> = {};
	for (const member of members) {
		plugins[member] = { options: {} };
	}
	if (roots.length > 0) {
		if (plugins.search !== undefined) {
			plugins.search.options = { roots };
			rationale.push(
				`search roots derived from the real top-level layout: ${roots.join(', ')}.`,
			);
		}
		if (plugins.conventions !== undefined) {
			plugins.conventions.options = { roots };
		}
	}
	if (analysis.hasMcpProject) {
		rationale.push(
			'An MCP server already exists in this repo — mcp-vertex coexists; see plan_mcp_project for integration notes.',
		);
	}

	return {
		preset,
		config: {
			$schema: CONFIG_SCHEMA_URL,
			cacheDir: DEFAULT_CORE_PATHS.cacheDir,
			docsDir: DEFAULT_CORE_PATHS.docsDir,
			plugins,
		},
		rationale,
	};
};
