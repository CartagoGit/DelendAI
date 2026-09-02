import { resolve } from 'node:path';

/**
 * `Alias` moved from `vitest/config` to `vite` in vitest 4.x, and
 * `vite` is not a direct dep of every workspace (apps/web, plugins/…)
 * — so a direct `import type { Alias } from 'vite'` breaks `tsc -p
 * apps/web/tsconfig.json`. Declare the shape locally and rely on
 * structural compatibility: `resolve.alias` accepts any object that
 * matches `{ find: string | RegExp; replacement: string }`.
 */
export interface Alias {
	readonly find: string | RegExp;
	readonly replacement: string;
}

/**
 * Path to the global console-silencing vitest setup. Wired into every
 * project via `sharedSetupFiles` so production `console.log`/`warn`/
 * `error` calls made from tested code don't drown the validate stream.
 * Opt out per test with `process.env.ALLOW_TEST_OUTPUT = '1'` (used by
 * the 3 fault-injection suites that assert on real console output).
 */
export const silenceConsoleSetupFile = (workspaceRoot: string): string =>
	resolve(workspaceRoot, 'tools/scripts/lib/silence-console-setup.ts');

/**
 * Default setup file list shared by every vitest project. Add new
 * cross-cutting setup files here so adding a plugin doesn't require
 * remembering to wire them.
 */
export const sharedSetupFiles = (workspaceRoot: string): string[] => [
	silenceConsoleSetupFile(workspaceRoot),
];

/**
 * Shared module aliases so specs can import via the public package
 * specifiers (`@mcp-vertex/core/...`, `@mcp-vertex/proposals/...`)
 * without a tsconfig-paths plugin. Mirrors `tsconfig.base.json` paths.
 * Order matters: more specific subpaths must come before the bare name.
 */
export const workspaceAliases = (workspaceRoot: string): Alias[] => {
	const core = resolve(workspaceRoot, 'packages/core/src');
	const proposals = resolve(workspaceRoot, 'plugins/proposals/src');
	const promptsPack = resolve(workspaceRoot, 'plugins/prompts-pack/src');
	const rules = resolve(workspaceRoot, 'plugins/rules/src');
	const memory = resolve(workspaceRoot, 'plugins/memory/src');
	const git = resolve(workspaceRoot, 'plugins/git/src');
	const forge = resolve(workspaceRoot, 'plugins/forge/src');
	const remoteProviderCore = resolve(
		workspaceRoot,
		'plugins/remote-provider-core/src',
	);
	const github = resolve(workspaceRoot, 'plugins/github/src');
	const gitlab = resolve(workspaceRoot, 'plugins/gitlab/src');
	const quality = resolve(workspaceRoot, 'plugins/quality/src');
	const refactor = resolve(workspaceRoot, 'plugins/refactor/src');
	const search = resolve(workspaceRoot, 'plugins/search/src');
	const docs = resolve(workspaceRoot, 'plugins/docs/src');
	const deps = resolve(workspaceRoot, 'plugins/deps/src');
	const security = resolve(workspaceRoot, 'plugins/security/src');
	const skillsPack = resolve(workspaceRoot, 'plugins/skills-pack/src');
	const diagram = resolve(workspaceRoot, 'plugins/diagram/src');
	const env = resolve(workspaceRoot, 'plugins/env/src');
	const i18n = resolve(workspaceRoot, 'plugins/i18n/src');
	const perf = resolve(workspaceRoot, 'plugins/perf/src');
	const techDebt = resolve(workspaceRoot, 'plugins/tech-debt/src');
	const linkCheck = resolve(workspaceRoot, 'plugins/link-check/src');
	const logs = resolve(workspaceRoot, 'plugins/logs/src');
	const audit = resolve(workspaceRoot, 'plugins/audit/src');
	const browser = resolve(workspaceRoot, 'plugins/browser/src');
	const promptEval = resolve(workspaceRoot, 'plugins/prompt-eval/src');
	const notification = resolve(workspaceRoot, 'plugins/notification/src');
	const observability = resolve(workspaceRoot, 'plugins/observability/src');
	const orchestratorRunner = resolve(
		workspaceRoot,
		'plugins/orchestrator-runner/src',
	);
	const statusMarker = resolve(workspaceRoot, 'plugins/status-marker/src');
	const testConvention = resolve(
		workspaceRoot,
		'plugins/test-convention/src',
	);
	const testPolicy = resolve(workspaceRoot, 'plugins/test-policy/src');
	const usageTracking = resolve(workspaceRoot, 'plugins/usage-tracking/src');
	// x00189: token-budget.e2e imports `@mcp-vertex/test-policy` (it
	// is the only plugin used by a core spec that wasn't already in
	// the alias list). Without this entry the test resolves through
	// the package's published `main` (which points at `dist/index.js`)
	// and the bundled dist still uses the broken `import { z } from
	// 'zod'` form, surfacing the rolldown interop bug at test time.
	const webFetch = resolve(workspaceRoot, 'plugins/web-fetch/src');
	const autoAgentSelector = resolve(
		workspaceRoot,
		'plugins/auto-agent-selector/src',
	);
	const autoPluginSelector = resolve(
		workspaceRoot,
		'plugins/auto-plugin-selector/src',
	);
	const api = resolve(workspaceRoot, 'plugins/api/src');
	const conventions = resolve(workspaceRoot, 'plugins/conventions/src');
	const database = resolve(workspaceRoot, 'plugins/database/src');
	const issues = resolve(workspaceRoot, 'plugins/issues/src');
	const cache = resolve(workspaceRoot, 'plugins/cache/src');
	const contextForChange = resolve(
		workspaceRoot,
		'plugins/context-for-change/src',
	);
	const impactAnalysis = resolve(
		workspaceRoot,
		'plugins/impact-analysis/src',
	);
	const adaptiveOptimizer = resolve(
		workspaceRoot,
		'plugins/adaptive-optimizer/src',
	);
	const projectHealth = resolve(workspaceRoot, 'plugins/project-health/src');
	const projectKpis = resolve(workspaceRoot, 'plugins/project-kpis/src');
	const qualityPolicy = resolve(workspaceRoot, 'plugins/quality-policy/src');
	const commitPolicy = resolve(workspaceRoot, 'plugins/commit-policy/src');
	const changelog = resolve(workspaceRoot, 'plugins/changelog/src');
	const completion = resolve(workspaceRoot, 'plugins/completion/src');
	const errorReporting = resolve(
		workspaceRoot,
		'plugins/error-reporting/src',
	);
	const issuesTriage = resolve(workspaceRoot, 'plugins/issues-triage/src');
	const container = resolve(workspaceRoot, 'plugins/container/src');
	// `audit-orchestrator` imports `@mcp-vertex/agent-orchestrator/public`,
	// and this table is the only thing that makes a cross-plugin public
	// import resolvable under vitest. A missing entry is not a soft
	// failure: the importing plugin's whole spec file dies with "Cannot
	// find package", which is how `first-party-metadata.spec.ts` started
	// failing. `preset-drift` already flags the gap.
	const agentOrchestrator = resolve(
		workspaceRoot,
		'plugins/agent-orchestrator/src',
	);
	const auditOrchestrator = resolve(
		workspaceRoot,
		'plugins/audit-orchestrator/src',
	);
	const externalMcps = resolve(workspaceRoot, 'plugins/external-mcps/src');
	const client = resolve(workspaceRoot, 'packages/client/src');
	const cli = resolve(workspaceRoot, 'packages/cli/src');
	const testKit = resolve(workspaceRoot, 'packages/test-kit/src');
	const shared = resolve(workspaceRoot, 'apps/shared/src');
	return [
		{ find: '@mcp-vertex/cli', replacement: resolve(cli, 'index.ts') },
		{
			find: '@mcp-vertex/test-kit/public',
			replacement: resolve(testKit, 'public/index.ts'),
		},
		{
			find: '@mcp-vertex/test-kit',
			replacement: resolve(testKit, 'index.ts'),
		},
		{
			find: '@mcp-vertex/context-for-change/public',
			replacement: resolve(contextForChange, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/context-for-change\/lib\/(.*)$/,
			replacement: `${resolve(contextForChange, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/context-for-change',
			replacement: resolve(contextForChange, 'index.ts'),
		},
		{
			find: '@mcp-vertex/impact-analysis/public',
			replacement: resolve(impactAnalysis, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/impact-analysis\/lib\/(.*)$/,
			replacement: `${resolve(impactAnalysis, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/impact-analysis',
			replacement: resolve(impactAnalysis, 'index.ts'),
		},
		{
			find: '@mcp-vertex/audit-orchestrator/public',
			replacement: resolve(auditOrchestrator, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/audit-orchestrator\/lib\/(.*)$/,
			replacement: `${resolve(auditOrchestrator, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/audit-orchestrator',
			replacement: resolve(auditOrchestrator, 'index.ts'),
		},
		{
			find: /^@mcp-vertex\/external-mcps\/lib\/(.*)$/,
			replacement: `${resolve(externalMcps, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/external-mcps',
			replacement: resolve(externalMcps, 'index.ts'),
		},
		{
			find: '@mcp-vertex/agent-orchestrator/public',
			replacement: resolve(agentOrchestrator, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/agent-orchestrator\/lib\/(.*)$/,
			replacement: `${resolve(agentOrchestrator, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/agent-orchestrator',
			replacement: resolve(agentOrchestrator, 'index.ts'),
		},
		{
			find: '@mcp-vertex/adaptive-optimizer/public',
			replacement: resolve(adaptiveOptimizer, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/adaptive-optimizer\/lib\/(.*)$/,
			replacement: `${resolve(adaptiveOptimizer, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/adaptive-optimizer',
			replacement: resolve(adaptiveOptimizer, 'index.ts'),
		},
		{
			find: '@mcp-vertex/project-health/public',
			replacement: resolve(projectHealth, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/project-health\/lib\/(.*)$/,
			replacement: `${resolve(projectHealth, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/project-health',
			replacement: resolve(projectHealth, 'index.ts'),
		},
		{
			find: '@mcp-vertex/project-kpis/public',
			replacement: resolve(projectKpis, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/project-kpis\/lib\/(.*)$/,
			replacement: `${resolve(projectKpis, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/project-kpis',
			replacement: resolve(projectKpis, 'index.ts'),
		},
		{
			find: '@mcp-vertex/quality-policy/public',
			replacement: resolve(qualityPolicy, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/quality-policy\/lib\/(.*)$/,
			replacement: `${resolve(qualityPolicy, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/quality-policy',
			replacement: resolve(qualityPolicy, 'index.ts'),
		},
		{
			find: '@mcp-vertex/commit-policy/public',
			replacement: resolve(commitPolicy, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/commit-policy\/lib\/(.*)$/,
			replacement: `${resolve(commitPolicy, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/commit-policy',
			replacement: resolve(commitPolicy, 'index.ts'),
		},
		{
			find: '@mcp-vertex/shared/i18n',
			replacement: resolve(shared, 'i18n/index.ts'),
		},
		{
			find: /^@mcp-vertex\/shared\/styles\/(.*)$/,
			replacement: resolve(shared, 'styles/$1'),
		},
		{
			find: '@mcp-vertex/container/public',
			replacement: resolve(container, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/container\/lib\/(.*)$/,
			replacement: `${resolve(container, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/container',
			replacement: resolve(container, 'index.ts'),
		},
		{
			find: '@mcp-vertex/shared/styles',
			replacement: resolve(shared, 'styles/_index.scss'),
		},
		{
			find: /^@mcp-vertex\/shared\/components\/(.*)$/,
			replacement: resolve(shared, 'components/$1'),
		},
		{
			find: '@mcp-vertex/shared',
			replacement: resolve(shared, 'public/index.ts'),
		},
		{
			find: '@mcp-vertex/core/version',
			replacement: resolve(core, 'version.ts'),
		},
		{
			find: '@mcp-vertex/core/public',
			replacement: resolve(core, 'public/index.ts'),
		},
		{
			find: '@mcp-vertex/core/contracts',
			replacement: resolve(core, 'contracts/index.ts'),
		},
		{
			find: '@mcp-vertex/core/runtime',
			replacement: resolve(core, 'runtime/index.ts'),
		},
		{
			find: '@mcp-vertex/core/plugin',
			replacement: resolve(core, 'plugin/index.ts'),
		},
		{
			find: '@mcp-vertex/core/node',
			replacement: resolve(core, 'node/index.ts'),
		},
		{
			find: /^@mcp-vertex\/core\/lib\/(.*)$/,
			replacement: `${resolve(core, 'lib')}/$1`,
		},
		{ find: '@mcp-vertex/core', replacement: resolve(core, 'index.ts') },
		{
			find: '@mcp-vertex/proposals/public',
			replacement: resolve(proposals, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/proposals\/lib\/(.*)$/,
			replacement: `${resolve(proposals, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/proposals',
			replacement: resolve(proposals, 'index.ts'),
		},
		{
			find: '@mcp-vertex/prompts-pack/public',
			replacement: resolve(promptsPack, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/prompts-pack\/lib\/(.*)$/,
			replacement: `${resolve(promptsPack, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/prompts-pack',
			replacement: resolve(promptsPack, 'index.ts'),
		},
		{
			find: '@mcp-vertex/rules/public',
			replacement: resolve(rules, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/rules\/lib\/(.*)$/,
			replacement: `${resolve(rules, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/rules',
			replacement: resolve(rules, 'index.ts'),
		},
		{
			find: '@mcp-vertex/memory/public',
			replacement: resolve(memory, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/memory\/lib\/(.*)$/,
			replacement: `${resolve(memory, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/memory',
			replacement: resolve(memory, 'index.ts'),
		},
		{
			find: '@mcp-vertex/git/public',
			replacement: resolve(git, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/git\/lib\/(.*)$/,
			replacement: `${resolve(git, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/git',
			replacement: resolve(git, 'index.ts'),
		},
		{
			find: '@mcp-vertex/forge/public',
			replacement: resolve(forge, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/forge\/lib\/(.*)$/,
			replacement: `${resolve(forge, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/forge',
			replacement: resolve(forge, 'index.ts'),
		},
		{
			find: '@mcp-vertex/remote-provider-core/public',
			replacement: resolve(remoteProviderCore, 'public/index.ts'),
		},
		{
			find: '@mcp-vertex/remote-provider-core',
			replacement: resolve(remoteProviderCore, 'index.ts'),
		},
		{
			find: '@mcp-vertex/gitlab/public',
			replacement: resolve(gitlab, 'public/index.ts'),
		},
		{
			find: '@mcp-vertex/gitlab',
			replacement: resolve(gitlab, 'index.ts'),
		},
		{
			find: '@mcp-vertex/github/public',
			replacement: resolve(github, 'public/index.ts'),
		},
		{
			find: '@mcp-vertex/github',
			replacement: resolve(github, 'index.ts'),
		},
		{
			find: '@mcp-vertex/quality/public',
			replacement: resolve(quality, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/quality\/lib\/(.*)$/,
			replacement: `${resolve(quality, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/quality',
			replacement: resolve(quality, 'index.ts'),
		},
		{
			find: '@mcp-vertex/refactor/public',
			replacement: resolve(refactor, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/refactor\/lib\/(.*)$/,
			replacement: `${resolve(refactor, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/refactor',
			replacement: resolve(refactor, 'index.ts'),
		},
		{
			find: '@mcp-vertex/search/public',
			replacement: resolve(search, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/search\/lib\/(.*)$/,
			replacement: `${resolve(search, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/search',
			replacement: resolve(search, 'index.ts'),
		},
		{
			find: '@mcp-vertex/notification/public',
			replacement: resolve(notification, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/notification\/lib\/(.*)$/,
			replacement: `${resolve(notification, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/notification',
			replacement: resolve(notification, 'index.ts'),
		},
		{
			find: '@mcp-vertex/observability/public',
			replacement: resolve(observability, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/observability\/lib\/(.*)$/,
			replacement: `${resolve(observability, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/observability',
			replacement: resolve(observability, 'index.ts'),
		},
		{
			find: '@mcp-vertex/docs/public',
			replacement: resolve(docs, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/docs\/lib\/(.*)$/,
			replacement: `${resolve(docs, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/docs',
			replacement: resolve(docs, 'index.ts'),
		},
		{
			find: '@mcp-vertex/deps/public',
			replacement: resolve(deps, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/deps\/lib\/(.*)$/,
			replacement: `${resolve(deps, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/deps',
			replacement: resolve(deps, 'index.ts'),
		},
		{
			find: '@mcp-vertex/security/public',
			replacement: resolve(security, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/security\/lib\/(.*)$/,
			replacement: `${resolve(security, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/security',
			replacement: resolve(security, 'index.ts'),
		},
		{
			find: '@mcp-vertex/skills-pack/public',
			replacement: resolve(skillsPack, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/skills-pack\/lib\/(.*)$/,
			replacement: `${resolve(skillsPack, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/skills-pack',
			replacement: resolve(skillsPack, 'index.ts'),
		},
		{
			find: '@mcp-vertex/prompts-pack/public',
			replacement: resolve(promptsPack, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/prompts-pack\/lib\/(.*)$/,
			replacement: `${resolve(promptsPack, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/prompts-pack',
			replacement: resolve(promptsPack, 'index.ts'),
		},
		{
			find: '@mcp-vertex/diagram/public',
			replacement: resolve(diagram, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/diagram\/lib\/(.*)$/,
			replacement: `${resolve(diagram, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/diagram',
			replacement: resolve(diagram, 'index.ts'),
		},
		{
			find: '@mcp-vertex/env/public',
			replacement: resolve(env, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/env\/lib\/(.*)$/,
			replacement: `${resolve(env, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/env',
			replacement: resolve(env, 'index.ts'),
		},
		{
			find: '@mcp-vertex/i18n/public',
			replacement: resolve(i18n, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/i18n\/lib\/(.*)$/,
			replacement: `${resolve(i18n, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/i18n',
			replacement: resolve(i18n, 'index.ts'),
		},
		{
			find: '@mcp-vertex/perf/public',
			replacement: resolve(perf, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/perf\/lib\/(.*)$/,
			replacement: `${resolve(perf, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/perf',
			replacement: resolve(perf, 'index.ts'),
		},
		{
			find: '@mcp-vertex/tech-debt/public',
			replacement: resolve(techDebt, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/tech-debt\/lib\/(.*)$/,
			replacement: `${resolve(techDebt, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/tech-debt',
			replacement: resolve(techDebt, 'index.ts'),
		},
		{
			find: '@mcp-vertex/link-check/public',
			replacement: resolve(linkCheck, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/link-check\/lib\/(.*)$/,
			replacement: `${resolve(linkCheck, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/link-check',
			replacement: resolve(linkCheck, 'index.ts'),
		},
		{
			find: '@mcp-vertex/logs/public',
			replacement: resolve(logs, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/logs\/lib\/(.*)$/,
			replacement: `${resolve(logs, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/logs',
			replacement: resolve(logs, 'index.ts'),
		},
		{
			find: '@mcp-vertex/audit/public',
			replacement: resolve(audit, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/audit\/lib\/(.*)$/,
			replacement: `${resolve(audit, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/audit',
			replacement: resolve(audit, 'index.ts'),
		},
		{
			find: '@mcp-vertex/browser/public',
			replacement: resolve(browser, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/browser\/lib\/(.*)$/,
			replacement: `${resolve(browser, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/browser',
			replacement: resolve(browser, 'index.ts'),
		},

		{
			find: '@mcp-vertex/prompt-eval/public',
			replacement: resolve(promptEval, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/prompt-eval\/lib\/(.*)$/,
			replacement: `${resolve(promptEval, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/prompt-eval',
			replacement: resolve(promptEval, 'index.ts'),
		},
		{
			find: '@mcp-vertex/status-marker/public',
			replacement: resolve(statusMarker, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/status-marker\/lib\/(.*)$/,
			replacement: `${resolve(statusMarker, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/status-marker',
			replacement: resolve(statusMarker, 'index.ts'),
		},
		{
			find: '@mcp-vertex/test-convention/public',
			replacement: resolve(testConvention, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/test-convention\/lib\/(.*)$/,
			replacement: `${resolve(testConvention, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/test-convention',
			replacement: resolve(testConvention, 'index.ts'),
		},
		{
			find: '@mcp-vertex/web-fetch/public',
			replacement: resolve(webFetch, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/web-fetch\/lib\/(.*)$/,
			replacement: `${resolve(webFetch, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/web-fetch',
			replacement: resolve(webFetch, 'index.ts'),
		},
		{
			find: '@mcp-vertex/test-policy/public',
			replacement: resolve(testPolicy, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/test-policy\/lib\/(.*)$/,
			replacement: `${resolve(testPolicy, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/test-policy',
			replacement: resolve(testPolicy, 'index.ts'),
		},
		{
			find: '@mcp-vertex/usage-tracking/public',
			replacement: resolve(usageTracking, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/usage-tracking\/lib\/(.*)$/,
			replacement: `${resolve(usageTracking, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/usage-tracking',
			replacement: resolve(usageTracking, 'index.ts'),
		},
		{
			find: '@mcp-vertex/auto-agent-selector/public',
			replacement: resolve(autoAgentSelector, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/auto-agent-selector\/lib\/(.*)$/,
			replacement: `${resolve(autoAgentSelector, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/auto-agent-selector',
			replacement: resolve(autoAgentSelector, 'index.ts'),
		},
		{
			find: '@mcp-vertex/auto-plugin-selector/public',
			replacement: resolve(autoPluginSelector, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/auto-plugin-selector\/lib\/(.*)$/,
			replacement: `${resolve(autoPluginSelector, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/auto-plugin-selector',
			replacement: resolve(autoPluginSelector, 'index.ts'),
		},
		{
			find: '@mcp-vertex/orchestrator-runner/public',
			replacement: resolve(orchestratorRunner, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/orchestrator-runner\/lib\/(.*)$/,
			replacement: `${resolve(orchestratorRunner, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/orchestrator-runner',
			replacement: resolve(orchestratorRunner, 'index.ts'),
		},
		{
			find: '@mcp-vertex/api/public',
			replacement: resolve(api, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/api\/lib\/(.*)$/,
			replacement: `${resolve(api, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/api',
			replacement: resolve(api, 'index.ts'),
		},
		{
			find: '@mcp-vertex/conventions/public',
			replacement: resolve(conventions, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/conventions\/lib\/(.*)$/,
			replacement: `${resolve(conventions, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/conventions',
			replacement: resolve(conventions, 'index.ts'),
		},
		{
			find: '@mcp-vertex/database/public',
			replacement: resolve(database, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/database\/lib\/(.*)$/,
			replacement: `${resolve(database, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/database',
			replacement: resolve(database, 'index.ts'),
		},
		{
			find: '@mcp-vertex/issues/public',
			replacement: resolve(issues, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/issues\/lib\/(.*)$/,
			replacement: `${resolve(issues, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/issues',
			replacement: resolve(issues, 'index.ts'),
		},
		{
			find: '@mcp-vertex/cache/public',
			replacement: resolve(cache, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/cache\/lib\/(.*)$/,
			replacement: `${resolve(cache, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/cache',
			replacement: resolve(cache, 'index.ts'),
		},
		{
			find: '@mcp-vertex/changelog/public',
			replacement: resolve(changelog, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/changelog\/lib\/(.*)$/,
			replacement: `${resolve(changelog, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/changelog',
			replacement: resolve(changelog, 'index.ts'),
		},
		{
			find: '@mcp-vertex/completion/public',
			replacement: resolve(completion, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/completion\/lib\/(.*)$/,
			replacement: `${resolve(completion, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/completion',
			replacement: resolve(completion, 'index.ts'),
		},
		{
			find: '@mcp-vertex/error-reporting/public',
			replacement: resolve(errorReporting, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/error-reporting\/lib\/(.*)$/,
			replacement: `${resolve(errorReporting, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/error-reporting',
			replacement: resolve(errorReporting, 'index.ts'),
		},
		{
			find: '@mcp-vertex/issues-triage/public',
			replacement: resolve(issuesTriage, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/issues-triage\/lib\/(.*)$/,
			replacement: `${resolve(issuesTriage, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/issues-triage',
			replacement: resolve(issuesTriage, 'index.ts'),
		},
		{
			find: '@mcp-vertex/client/public',
			replacement: resolve(client, 'public/index.ts'),
		},
		{
			find: '@mcp-vertex/client/node',
			replacement: resolve(client, 'node/index.ts'),
		},
		{
			find: /^@mcp-vertex\/client\/lib\/(.*)$/,
			replacement: `${resolve(client, 'lib')}/$1`,
		},
		{
			find: '@mcp-vertex/client',
			replacement: resolve(client, 'index.ts'),
		},
		{
			find: '@mcp-vertex/ui-extension/public',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/public/index.ts',
			),
		},
		{
			find: /^@mcp-vertex\/ui-extension\/(webview|components|dashboard|dev|brand)(?:\/(.*))?$/,
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/$1/index.ts',
			),
		},
		{
			find: '@mcp-vertex/ui-extension',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/index.ts',
			),
		},
		{
			find: '@mcp-vertex/ide/public',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/public/index.ts',
			),
		},
		{
			find: '@mcp-vertex/ide',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/index.ts',
			),
		},
	];
};
