import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IScaffoldToolOptions } from '@delendai/core/public';
import {
	buildScaffoldReport,
	buildStandaloneCoreToolRegistrations,
	createWorkspacePathProvider,
	scaffoldAgentFile,
	scaffoldClaudeAgentFile,
	scaffoldCodexAgentFile,
	scaffoldHostProject,
	scaffoldPluginFiles,
	scaffoldPromptFile,
	scaffoldSkillFile,
	scaffoldToolFile,
} from '@delendai/core/public';

const HOST = {
	projectName: 'Acme Quest',
	namespacePrefix: 'acme',
	projectPackageName: '@acme/mcp-project',
} as const;

describe('scaffold-host generators', () => {
	it('generates a registerable tool file in the host namespace', () => {
		const file = scaffoldToolFile('acme', 'render stats', 'Stats only.');
		expect(file.path).toBe(
			'libs/mcp-project/src/lib/tools/acme-render-stats.tool.ts',
		);
		expect(file.content).toContain("name: 'acme_render_stats'");
		expect(file.content).toContain(
			'export async function registerRenderStatsTool',
		);
	});

	it('preserves the generated tool path for repeated separators in the tool name', () => {
		const file = scaffoldToolFile(
			'acme',
			'  render___stats!!!  ',
			'Stats only.',
		);
		expect(file.path).toBe(
			'libs/mcp-project/src/lib/tools/acme-render-stats.tool.ts',
		);
	});

	it('normalises a long separator run in the tool name quickly', () => {
		const started = Date.now();
		const file = scaffoldToolFile(
			'acme',
			`render${'!'.repeat(40_000)}stats`,
			'Stats only.',
		);
		expect(file.path).toBe(
			'libs/mcp-project/src/lib/tools/acme-render-stats.tool.ts',
		);
		expect(Date.now() - started).toBeLessThan(500);
	});

	it('sanitizes hyphenated namespaces for generated TypeScript symbols', () => {
		const file = scaffoldToolFile(
			'delendai',
			'project state',
			'State.',
			'packages/core',
		);
		expect(file.path).toBe(
			'packages/core/src/lib/tools/delendai-project-state.tool.ts',
		);
		expect(file.content).toContain(
			'export const DELENDAI_PROJECT_STATE_TOOL',
		);
		expect(file.content).toContain("name: 'delendai_project_state'");
		expect(file.content).not.toContain('DELENDAI');
	});

	it('generates skills with canonical frontmatter', () => {
		const file = scaffoldSkillFile('acme', 'level design', 'Rooms.', [
			'Before editing rooms.',
		]);
		expect(file.path).toBe(
			'libs/mcp-project/src/lib/skills/acme-level-design.md',
		);
		expect(file.content).toContain('id: acme-level-design');
		expect(file.content).toContain('- Before editing rooms.');
		expect(file.content).toContain('acme_overview');
	});

	it('prompts accept a body argument that becomes the user-facing text', () => {
		const file = scaffoldPromptFile(
			'acme',
			'start',
			'Orient and start working.',
			'You are working in **Acme**. Call acme_overview first.',
		);
		expect(file.path).toBe(
			'libs/mcp-project/src/lib/prompts/acme-start.prompt.ts',
		);
		expect(file.content).toContain('You are working in **Acme**');
		expect(file.content).toContain('acme_overview');
		// Body must not leak template-literal backticks: the implementation
		// escapes them so a body containing `code` does not break the
		// generated source file.
		expect(file.content).not.toMatch(/text: `[^`]*\$\{/);
	});

	it('skills accept a body argument that becomes the skill body', () => {
		const file = scaffoldSkillFile(
			'acme',
			'angular conventions',
			'Angular idioms.',
			['Before writing Angular code.'],
			'## Angular idioms\n\n- Use standalone components.',
		);
		expect(file.content).toContain('## Angular idioms');
		expect(file.content).toContain('Use standalone components');
		// The TODO body fallback must NOT appear when a real body is given.
		expect(file.content).not.toContain('TODO: the skill body.');
	});

	it('agent adapters always delegate to the HOST MCP server', () => {
		const orchestrator = scaffoldAgentFile(HOST, 'orchestrator');
		expect(orchestrator.path).toBe('.github/agents/orchestrator.agent.md');
		expect(orchestrator.content).toContain('mcp-project-acme/*');
		expect(orchestrator.content).toContain('acme_overview');
		expect(orchestrator.content).toContain('acme_auto_work');
		expect(orchestrator.content).toContain('acme_delegate');
		expect(orchestrator.content).toContain('more than 3 tool calls');
		expect(orchestrator.content).toContain('user-invocable: true');
		// M9: the proposal-workflow tools are shown as conditional on the
		// plugin, never promised as always-present.
		expect(orchestrator.content).toContain('--plugins=proposals');
		expect(orchestrator.content).not.toContain('acme_check_project_state');
		const runner = scaffoldAgentFile(HOST, 'implementation_runner');
		expect(runner.content).toContain('user-invocable: false');
		expect(runner.content).not.toContain('delendai_');
	});

	// x00160 S1 — the Copilot `.agent.md` variant was the ONLY subagent
	// format ever scaffolded; AGENT-BOOTSTRAP.md §8.2 unconditionally
	// tells every Claude Code host to delegate to the orchestrator
	// subagent, so a Claude Code adopter never got one. Verified
	// against Claude Code's documented subagent contract
	// (code.claude.com/docs/en/sub-agents): required name (kebab-case)
	// + description; tools is a comma-separated STRING when present,
	// not a YAML list.
	it('scaffoldClaudeAgentFile emits a Claude Code-native subagent alongside the Copilot one', () => {
		const orchestrator = scaffoldClaudeAgentFile(HOST, 'orchestrator');
		expect(orchestrator.path).toBe('.claude/agents/orchestrator.md');
		expect(orchestrator.content).toMatch(/^---\nname: orchestrator\n/);
		expect(orchestrator.content).toContain('description:');
		expect(orchestrator.content).toContain('acme_overview');
		expect(orchestrator.content).toContain('acme_auto_work');
		expect(orchestrator.content).toContain('acme_delegate');
		expect(orchestrator.content).toContain('more than 3 tool calls');
		// No unmapped Copilot tool vocabulary leaks into the Claude file.
		expect(orchestrator.content).not.toContain('mcp-project-acme/*');
		expect(orchestrator.content).not.toContain('user-invocable');

		const runner = scaffoldClaudeAgentFile(HOST, 'implementation_runner');
		// SUBAGENT_SLOTS uses snake_case; Claude Code's `name` requires
		// kebab-case.
		expect(runner.path).toBe('.claude/agents/implementation-runner.md');
		expect(runner.content).toMatch(/^---\nname: implementation-runner\n/);
		expect(runner.content).not.toContain('delendai_');
	});

	it('scaffoldClaudeAgentFile omits an unrecognised model rather than emitting an invalid value', () => {
		const withBogusModel = scaffoldClaudeAgentFile(
			{ ...HOST, defaultModel: 'gpt-5' },
			'orchestrator',
		);
		expect(withBogusModel.content).not.toContain('model:');

		// x00183 (F6): CLAUDE_MODEL_ALIASES moved out of core — a bare
		// alias like "sonnet" only resolves when the host explicitly
		// supplies its alias list (core no longer bakes in a
		// Claude-specific default).
		const withRealModel = scaffoldClaudeAgentFile(
			{
				...HOST,
				defaultModel: 'sonnet',
				claudeModelAliases: [
					'sonnet',
					'opus',
					'haiku',
					'fable',
					'inherit',
				],
			},
			'orchestrator',
		);
		expect(withRealModel.content).toContain('model: sonnet');
	});

	it('scaffoldClaudeAgentFile omits a bare alias when the host does not supply claudeModelAliases', () => {
		const withoutAliases = scaffoldClaudeAgentFile(
			{ ...HOST, defaultModel: 'sonnet' },
			'orchestrator',
		);
		expect(withoutAliases.content).not.toContain('model:');
	});

	it('scaffoldClaudeAgentFile still resolves a claude-prefixed id with no alias list', () => {
		const withClaudeId = scaffoldClaudeAgentFile(
			{ ...HOST, defaultModel: 'claude-sonnet-5' },
			'orchestrator',
		);
		expect(withClaudeId.content).toContain('model: claude-sonnet-5');
	});

	it('scaffoldHostProject covers server, config, agents and docs', () => {
		const files = scaffoldHostProject(HOST);
		const paths = files.map((file) => file.path);
		expect(paths).toContain('libs/mcp-project/src/server.ts');
		expect(paths).toContain(
			'libs/mcp-project/src/lib/shared/host-config.ts',
		);
		expect(paths).toContain('.vscode/mcp.json');
		expect(paths).toContain('.github/agents/orchestrator.agent.md');
		expect(paths).toContain('.claude/agents/orchestrator.md');
		expect(paths).toContain('.github/copilot-instructions.md');
		expect(
			paths.filter((path) => path.startsWith('.github/agents/')),
		).toHaveLength(5);
		expect(
			paths.filter((path) => path.startsWith('.claude/agents/')),
		).toHaveLength(5);
		const config = files.find((file) =>
			file.path.endsWith('host-config.ts'),
		);
		expect(config?.content).toContain("namespacePrefix: 'acme'");
		// The default host surface is the standalone core set (overview +
		// bootstrap + scaffold) — never just the single-artefact scaffold
		// helper, or the generated agents would name tools the host lacks.
		expect(config?.content).toContain(
			'buildStandaloneCoreToolRegistrations',
		);
		expect(config?.content).not.toContain('buildScaffoldToolRegistration');
		// Greenfield host is self-contained: package, tsconfig, README and
		// the Codex CLI MCP registration ship alongside the server entry.
		expect(paths).toContain('libs/mcp-project/package.json');
		expect(paths).toContain('libs/mcp-project/tsconfig.json');
		expect(paths).toContain('libs/mcp-project/README.md');
		expect(paths).toContain('.codex/config.toml');
		const instructions = files.find((file) =>
			file.path.endsWith('copilot-instructions.md'),
		);
		expect(instructions?.content).toContain('acme_delegate');
		expect(instructions?.content).toContain('Orchestration threshold');
		// The generated project must not leak the host's own namespace.
		for (const file of files) {
			expect(file.content, file.path).not.toContain('delendai_');
		}
	});

	it('places host sources and VS Code cwd under an explicit target', () => {
		const files = scaffoldHostProject({
			...HOST,
			namespacePrefix: 'delendai',
			targetDir: 'packages/core',
		});
		const paths = files.map(({ path }) => path);
		expect(paths).toContain('packages/core/src/server.ts');
		expect(paths).toContain('packages/core/src/lib/shared/host-config.ts');
		expect(paths).not.toContain('libs/mcp-project/src/server.ts');
		const editorConfig = files.find(
			({ path }) => path === '.vscode/mcp.json',
		);
		expect(editorConfig?.content).toContain(
			'${workspaceFolder}/packages/core',
		);
	});

	it('scaffoldCodexAgentFile emits a Codex CLI-native subagent alongside the Copilot and Claude ones', () => {
		const orchestrator = scaffoldCodexAgentFile(HOST, 'orchestrator');
		expect(orchestrator.path).toBe('.codex/agents/orchestrator.md');
		expect(orchestrator.content).toMatch(/^---\nname: orchestrator\n/);
		expect(orchestrator.content).toContain('description:');
		expect(orchestrator.content).toContain('acme_overview');
		expect(orchestrator.content).toContain('acme_auto_work');
		expect(orchestrator.content).toContain('acme_delegate');
		expect(orchestrator.content).toContain('more than 3 tool calls');
		// No Copilot-only vocabulary leaks into the Codex file.
		expect(orchestrator.content).not.toContain('mcp-project-acme');
		expect(orchestrator.content).not.toContain('user-invocable');
		expect(orchestrator.content).not.toContain('display-name');
		expect(orchestrator.content).not.toContain('icon:');

		const runner = scaffoldCodexAgentFile(HOST, 'implementation_runner');
		// SUBAGENT_SLOTS uses snake_case; Codex kebab-case like Claude.
		expect(runner.path).toBe('.codex/agents/implementation-runner.md');
		expect(runner.content).toMatch(/^---\nname: implementation-runner\n/);
	});

	it('scaffoldHostProject emits 5 Codex subagents + 5 Claude + 5 Copilot agents by default', () => {
		const files = scaffoldHostProject(HOST);
		const paths = files.map((f) => f.path);
		expect(
			paths.filter((p) => p.startsWith('.codex/agents/')),
		).toHaveLength(5);
		expect(
			paths.filter((p) => p.startsWith('.claude/agents/')),
		).toHaveLength(5);
		expect(
			paths.filter((p) => p.startsWith('.github/agents/')),
		).toHaveLength(5);
		// Codex agent names are kebab-case.
		expect(paths).toContain('.codex/agents/orchestrator.md');
		expect(paths).toContain('.codex/agents/proposal-guardian.md');
		expect(paths).toContain('.codex/agents/implementation-runner.md');
		expect(paths).toContain('.codex/agents/delivery-verifier.md');
		expect(paths).toContain('.codex/agents/technical-investigator.md');
	});

	it('existingDelendai=true skips the libs/mcp-project bootstrap and the .vscode/mcp.json', () => {
		const files = scaffoldHostProject({
			...HOST,
			existingDelendai: true,
		});
		const paths = files.map((f) => f.path);
		// No host bootstrap.
		expect(paths).not.toContain('libs/mcp-project/src/server.ts');
		expect(paths).not.toContain('libs/mcp-project/src/index.ts');
		expect(paths).not.toContain(
			'libs/mcp-project/src/lib/shared/host-config.ts',
		);
		expect(paths).not.toContain('.vscode/mcp.json');
		// Agents / instructions / skill still emitted.
		expect(paths).toContain('.github/agents/orchestrator.agent.md');
		expect(paths).toContain('.claude/agents/orchestrator.md');
		expect(paths).toContain('.codex/agents/orchestrator.md');
		expect(paths).toContain('.github/copilot-instructions.md');
		expect(
			paths.some((p) => p.endsWith('skills/acme-project-standards.md')),
		).toBe(true);
	});

	it('existingDelendai=false (default) still emits the libs/mcp-project bootstrap', () => {
		const files = scaffoldHostProject(HOST);
		const paths = files.map((f) => f.path);
		expect(paths).toContain('libs/mcp-project/src/server.ts');
		expect(paths).toContain('.vscode/mcp.json');
	});

	// x00201 S1 — guest-mode adopters (existingDelendai: true) already have
	// their OWN registered MCP server name (postman-exporter's real key is
	// `delendai`, not the greenfield `mcp-project-<prefix>` default).
	// Without `mcpServerName`, every generated agent's first tool call
	// addressed a server that does not exist.
	it('mcpServerName overrides the greenfield mcp-project-<prefix> default in every Copilot-facing surface', () => {
		const withRealServerName = { ...HOST, mcpServerName: 'delendai' };
		const orchestrator = scaffoldAgentFile(
			withRealServerName,
			'orchestrator',
		);
		expect(orchestrator.content).toContain('delendai/*');
		expect(orchestrator.content).toContain('delendai/acme_overview');
		expect(orchestrator.content).not.toContain('mcp-project-acme');

		const instructions = scaffoldHostProject(withRealServerName).find(
			(file) => file.path.endsWith('copilot-instructions.md'),
		);
		expect(instructions?.content).toContain('delendai` rules');
		expect(instructions?.content).not.toContain('mcp-project-acme');
	});

	it('mcpServerName defaults to mcp-project-<prefix> when omitted (greenfield, unchanged)', () => {
		const orchestrator = scaffoldAgentFile(HOST, 'orchestrator');
		expect(orchestrator.content).toContain('mcp-project-acme/*');
		expect(orchestrator.content).toContain(
			'mcp-project-acme/acme_overview',
		);
	});

	// x00208 S4 — the contract test behind the original ROTO: the
	// generated agents promise `overview` + the bootstrap tools as
	// always-present, so the standalone host MUST register exactly that
	// surface (proposal tools stay conditional on the CLI's proposals
	// plugin and are therefore not required here).
	it('standalone core surface registers every always-present tool the agents promise', () => {
		const workspace = createWorkspacePathProvider(tmpdir());
		const registrations = buildStandaloneCoreToolRegistrations({
			namespacePrefix: 'acme',
			workspace,
			projectName: 'Acme Quest',
			projectPackageName: '@acme/mcp-project',
		});
		const ids = registrations.map((registration) => registration.id);
		expect(ids).toContain('overview');
		expect(ids).toContain('analyze_project');
		expect(ids).toContain('plan_mcp_project');
		expect(ids).toContain('create_project');
		expect(ids).toContain('drift_check');
		expect(ids).toContain('scaffold');
		// Ids are unique — planRegistrationOrder must not reject the set.
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('scaffoldPluginFiles (f00120 S1)', () => {
	it('ping tool template declares outputSchema (a00085 #9)', () => {
		const files = scaffoldPluginFiles({
			pluginName: 'demo',
			description: 'A demo plugin scaffolded for testing.',
		});
		const index = files.find((file) =>
			file.path.endsWith('plugins/demo/src/index.ts'),
		);
		expect(index?.content).toContain('outputSchema: z.object({');
		expect(index?.content).toContain('plugin: z.string()');
	});

	it('emits the eight canonical plugin files', () => {
		const files = scaffoldPluginFiles({
			pluginName: 'demo',
			description: 'A demo plugin scaffolded for testing.',
		});
		const paths = files.map((f) => f.path);
		expect(paths).toEqual([
			'plugins/demo/package.json',
			'plugins/demo/src/index.ts',
			'plugins/demo/tsconfig.json',
			'plugins/demo/README.md',
			'plugins/demo/vitest.config.ts',
			'plugins/demo/LICENSE',
			'plugins/demo/src/public/index.ts',
			'plugins/demo/src/contracts/interfaces/plugin-options.interface.ts',
			'plugins/demo/tests/src/lib/ping.spec.ts',
		]);
	});

	it('emits a registerable plugin with a `ping` tool', () => {
		const files = scaffoldPluginFiles({
			pluginName: 'demo',
			description: 'A demo plugin.',
		});
		const index = files.find((f) => f.path === 'plugins/demo/src/index.ts');
		expect(index?.content).toContain("name: 'demo'");
		expect(index?.content).toContain("id: 'demo_ping'");
		expect(index?.content).toContain('definePlugin');
	});

	it('emits a self-contained vitest config (no monorepo coupling)', () => {
		// The scaffold's vitest config must NOT import `../../vitest.shared`
		// — an adopter who runs `create_project` in their own repo has no
		// monorepo at the root and the import would fail. The monorepo
		// itself uses `verify:plugin-wiring` to swap this for a
		// shared-aliases version after the wire step; outside the
		// monorepo the inline config is what runs.
		const files = scaffoldPluginFiles({
			pluginName: 'demo',
			description: 'demo.',
		});
		const vitest = files.find(
			(f) => f.path === 'plugins/demo/vitest.config.ts',
		);
		expect(vitest?.content).toContain('defineConfig');
		expect(vitest?.content).not.toContain('vitest.shared');
		expect(vitest?.content).not.toContain('sharedSetupFiles');
		expect(vitest?.content).not.toContain('workspaceAliases');
		expect(vitest?.content).toContain("'src/**/*.spec.ts'");
		expect(vitest?.content).toContain("'tests/**/*.spec.ts'");
	});

	it('emits a sample spec that asserts the plugin id + ping tool', () => {
		const files = scaffoldPluginFiles({
			pluginName: 'demo',
			description: 'demo.',
		});
		const spec = files.find(
			(f) => f.path === 'plugins/demo/tests/src/lib/ping.spec.ts',
		);
		expect(spec?.content).toContain("plugin.name).toBe('demo')");
		expect(spec?.content).toContain('tools.find');
	});

	it('emits a LICENSE with the current year', () => {
		const files = scaffoldPluginFiles({
			pluginName: 'demo',
			description: 'demo.',
		});
		const license = files.find((f) => f.path === 'plugins/demo/LICENSE');
		const year = new Date().getUTCFullYear();
		expect(license?.content).toContain(`Copyright (c) ${year} demo`);
	});
});

describe('scaffold tool report', () => {
	let root = '';
	let options: IScaffoldToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'delendai-scaffold-'));
		options = {
			...HOST,
			workspace: createWorkspacePathProvider(root),
		};
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('dry-run returns the files without touching the disk', async () => {
		const report = await buildScaffoldReport(options, {
			kind: 'host',
			dryRun: true,
		});
		expect(report.files.length).toBeGreaterThan(5);
		expect(report.written).toEqual([]);
		expect(existsSync(join(root, 'libs'))).toBe(false);
	});

	it('write mode creates files once and refuses overwrites', async () => {
		const first = await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Combat rules.',
			dryRun: false,
		});
		expect(first.written).toEqual([
			'libs/mcp-project/src/lib/skills/acme-combat.md',
		]);
		expect(first.moved).toEqual([]);
		expect(first.kept).toEqual([]);
		expect(
			readFileSync(
				join(root, 'libs/mcp-project/src/lib/skills/acme-combat.md'),
				'utf8',
			),
		).toContain('id: acme-combat');
		const second = await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Combat rules.',
			dryRun: false,
		});
		expect(second.written).toEqual([]);
		expect(second.skipped).toEqual([
			'libs/mcp-project/src/lib/skills/acme-combat.md',
		]);
		expect(second.kept).toEqual(second.skipped);
		expect(second.moved).toEqual([]);
	});

	it('keepLegacy moves the old target to legacy and writes the fresh scaffold', async () => {
		const target = join(
			root,
			'libs/mcp-project/src/lib/skills/acme-combat.md',
		);
		const first = await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Combat rules.',
			dryRun: false,
		});
		expect(first.written).toEqual([
			'libs/mcp-project/src/lib/skills/acme-combat.md',
		]);
		const oldContent = `${readFileSync(target, 'utf8')}\n# local edit\n`;
		writeFileSync(target, oldContent);

		const second = await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Fresh combat rules.',
			dryRun: false,
			keepLegacy: true,
		});

		expect(second.skipped).toEqual([]);
		expect(second.kept).toEqual([]);
		expect(second.written).toEqual([
			'libs/mcp-project/src/lib/skills/acme-combat.md',
		]);
		expect(second.moved).toHaveLength(1);
		expect(second.moved[0]).toMatch(/^legacy\/acme-combat-[a-z0-9]+\.md$/);
		expect(readFileSync(join(root, second.moved[0] ?? ''), 'utf8')).toBe(
			oldContent,
		);
		expect(readFileSync(target, 'utf8')).toContain('Fresh combat rules.');
	});

	it('dry-run with keepLegacy reports files without moving existing targets', async () => {
		await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Combat rules.',
			dryRun: false,
		});
		const target = join(
			root,
			'libs/mcp-project/src/lib/skills/acme-combat.md',
		);
		const before = readFileSync(target, 'utf8');
		const report = await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Fresh combat rules.',
			dryRun: true,
			keepLegacy: true,
		});
		expect(report.written).toEqual([]);
		expect(report.moved).toEqual([]);
		expect(existsSync(join(root, 'legacy'))).toBe(false);
		expect(readFileSync(target, 'utf8')).toBe(before);
	});

	it('reports input errors instead of writing partial artefacts', async () => {
		const report = await buildScaffoldReport(options, {
			kind: 'tool',
			dryRun: false,
		});
		expect(report.errors[0]).toContain('requires name');
		expect(report.written).toEqual([]);
	});

	it('scaffolds a plugin and an MCP client', async () => {
		const plugin = await buildScaffoldReport(options, {
			kind: 'plugin',
			name: 'pepegrillo',
			description: 'Conscience plugin.',
			dryRun: true,
		});
		expect(plugin.files.map((f) => f.path)).toContain(
			'plugins/pepegrillo/src/index.ts',
		);
		const client = await buildScaffoldReport(options, {
			kind: 'client',
			name: 'acme',
			description: 'Acme MCP client.',
			dryRun: true,
		});
		expect(client.files.map((f) => f.path)).toContain(
			'clients/acme/src/index.ts',
		);
		const entry = client.files.find((f) =>
			f.path.endsWith('clients/acme/src/index.ts'),
		);
		expect(entry?.content).toContain('createAcmeClient');
	});

	it('a00067: scaffolded plugin/client tsconfig is self-contained (no extends into a nonexistent monorepo base)', async () => {
		for (const kind of ['plugin', 'client'] as const) {
			const report = await buildScaffoldReport(options, {
				kind,
				name: 'pepe',
				description: `Pepe ${kind}.`,
				dryRun: true,
			});
			const tsconfigFile = report.files.find((f) =>
				f.path.endsWith('/tsconfig.json'),
			);
			expect(tsconfigFile, `${kind} must emit a tsconfig`).toBeDefined();
			const tsconfig = JSON.parse(tsconfigFile?.content ?? '{}') as {
				extends?: string;
				compilerOptions?: Record<string, unknown>;
			};
			// An adopter's repo has no `tsconfig.base.json`: extending one
			// (or any path outside the package) makes `tsc` fail with TS5083
			// on their first build. The scaffold must stand alone.
			expect(tsconfig.extends).toBeUndefined();
			expect(tsconfig.compilerOptions?.strict).toBe(true);
			expect(tsconfig.compilerOptions?.target).toBe('ES2022');

			// …and the tsconfig must be RUNNABLE del tirón: the package ships
			// a typecheck script + the typescript toolchain to run it.
			const pkgFile = report.files.find((f) =>
				f.path.endsWith('/package.json'),
			);
			const pkg = JSON.parse(pkgFile?.content ?? '{}') as {
				scripts?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			expect(pkg.scripts?.typecheck).toContain('tsc');
			expect(pkg.devDependencies?.typescript).toMatch(/^\^7\./);
			expect(pkg.devDependencies?.['@types/node']).toBeDefined();
		}
	});
});
