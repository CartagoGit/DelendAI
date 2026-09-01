/**
 * standalone-core-tools.ts — the minimal, plugin-less core tool surface
 * a scaffolded greenfield host must register so the generated agents and
 * instructions are honest: every tool they name actually exists.
 *
 * The CLI's full core surface (`assemble-core-tools`) drags the plugin
 * loader, skill catalog and discovery phases with it. A custom host has
 * none of that — so it composes the SAME builders (`overview`,
 * `analyze/plan/create/drift`, `scaffold`) instead of reimplementing the
 * CLI. The proposal workflow (`auto_work`, `agent_lock`, …) is
 * deliberately NOT here: it lives in the `proposals` plugin, which only
 * the CLI can load. The generated README documents that launch path.
 *
 * SOLID — Single Responsibility: this module owns ONE thing — "which core
 * tools a standalone host exposes". The builders themselves stay the single
 * source of truth for each tool's contract.
 */
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IStandaloneCoreToolsOptions } from '../contracts/interfaces/standalone-core-tools.interface';
import { buildBootstrapToolRegistrations } from '../bootstrap/bootstrap-tool';
import type { IOverviewSnapshot } from '../tools/overview-tool';
import { buildOverviewToolRegistration } from '../tools/overview-tool';
import { buildScaffoldToolRegistration } from './scaffold-tool';

export type { IStandaloneCoreToolsOptions } from '../contracts/interfaces/standalone-core-tools.interface';

/**
 * The orientation + bootstrap surface the generated agents/instructions
 * promise: `overview` (always first), `analyze_project` / `plan_mcp_project`
 * / `create_project` / `drift_check`, and `scaffold` (so the project can
 * generate more of its own tools). Pure composition over the shared
 * builders — never a second implementation of any tool.
 */
export const buildStandaloneCoreToolRegistrations = (
	options: IStandaloneCoreToolsOptions,
): readonly IToolRegistration[] => {
	const {
		namespacePrefix,
		workspace,
		projectName,
		projectPackageName,
		serverName = `${namespacePrefix}-mcp-server`,
		serverVersion = '0.1.0',
		corePaths = {
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
		},
		keepLegacy = false,
	} = options;

	// `let` so the lazily-called snapshot closure reads the final list.
	let tools: readonly IToolRegistration[] = [];
	const snapshot = (): IOverviewSnapshot => ({
		server: { name: serverName, version: serverVersion },
		namespacePrefix,
		// Surface mode + counts come from
		// getProjectContext, which requires a workspaceRoot. The
		// standalone scaffold passes an empty string when no
		// workspace is configured; the runtime tolerates it.
		workspaceRoot: '',
		corePaths,
		plugins: [],
		tools: tools.map((registration) => ({
			name: `${namespacePrefix}_${registration.id}`,
			id: registration.id,
			...(registration.summary !== undefined
				? { summary: registration.summary }
				: {}),
			...(registration.tags !== undefined
				? { tags: registration.tags }
				: {}),
			...(registration.effects !== undefined
				? { effects: registration.effects }
				: {}),
		})),
		knowledge: [],
		recommendedNextAction:
			`Call ${namespacePrefix}_overview first, then ` +
			`${namespacePrefix}_analyze_project to map this project and ` +
			`${namespacePrefix}_scaffold to generate project tools.`,
	});

	tools = [
		buildOverviewToolRegistration(namespacePrefix, snapshot),
		...buildBootstrapToolRegistrations({
			workspace,
			namespacePrefix,
			cacheDir: corePaths.cacheDir,
		}),
		buildScaffoldToolRegistration({
			namespacePrefix,
			workspace,
			keepLegacy,
			projectName,
			projectPackageName,
		}),
	];
	return tools;
};
