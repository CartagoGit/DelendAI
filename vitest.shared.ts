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
 * Reporters shared by every vitest project.
 *
 * `journal-reporter.ts` writes each run — green or red — to
 * `.cache/mcp-vertex/results/logs/test-runs.jsonl`, so the failures of a
 * run whose output has scrolled away can be read back with
 * `bun run test:failures` instead of running the suite again. The root
 * `vitest.config.ts` wires it for the repo-wide run; a package config
 * that is executed on its own (`cd plugins/foo && vitest run`) should
 * spread this in so its runs are journalled too:
 *
 *   reporters: sharedReporters(workspaceRoot),
 *
 * The reporter prints nothing and swallows its own errors, so adding it
 * cannot change a run's outcome.
 */
export const sharedReporters = (workspaceRoot: string): string[] => [
	'default',
	resolve(workspaceRoot, 'tools/scripts/test/journal-reporter.ts'),
];

/**
 * Shared module aliases so specs can import via the public package
 * specifiers (`@delendai/core/...`, `@delendai/proposals/...`)
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
	// x00189: token-budget.e2e imports `@delendai/test-policy` (it
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
	// `audit-orchestrator` imports `@delendai/agent-orchestrator/public`,
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
		{ find: '@delendai/cli', replacement: resolve(cli, 'index.ts') },
		{
			find: '@delendai/test-kit/public',
			replacement: resolve(testKit, 'public/index.ts'),
		},
		{
			find: '@delendai/test-kit',
			replacement: resolve(testKit, 'index.ts'),
		},
		{
			find: '@delendai/context-for-change/public',
			replacement: resolve(contextForChange, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/context-for-change\/lib\/(.*)$/,
			replacement: `${resolve(contextForChange, 'lib')}/$1`,
		},
		{
			find: '@delendai/context-for-change',
			replacement: resolve(contextForChange, 'index.ts'),
		},
		{
			find: '@delendai/impact-analysis/public',
			replacement: resolve(impactAnalysis, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/impact-analysis\/lib\/(.*)$/,
			replacement: `${resolve(impactAnalysis, 'lib')}/$1`,
		},
		{
			find: '@delendai/impact-analysis',
			replacement: resolve(impactAnalysis, 'index.ts'),
		},
		{
			find: '@delendai/audit-orchestrator/public',
			replacement: resolve(auditOrchestrator, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/audit-orchestrator\/lib\/(.*)$/,
			replacement: `${resolve(auditOrchestrator, 'lib')}/$1`,
		},
		{
			find: '@delendai/audit-orchestrator',
			replacement: resolve(auditOrchestrator, 'index.ts'),
		},
		{
			// `external-mcps` has no separate public barrel, so `/public`
			// resolves to its entry — the same convention `github`,
			// `gitlab` and `remote-provider-core` use in tsconfig.base.json.
			find: '@delendai/external-mcps/public',
			replacement: resolve(externalMcps, 'index.ts'),
		},
		{
			find: /^@mcp-vertex\/external-mcps\/lib\/(.*)$/,
			replacement: `${resolve(externalMcps, 'lib')}/$1`,
		},
		{
			find: '@delendai/external-mcps',
			replacement: resolve(externalMcps, 'index.ts'),
		},
		{
			find: '@delendai/agent-orchestrator/public',
			replacement: resolve(agentOrchestrator, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/agent-orchestrator\/lib\/(.*)$/,
			replacement: `${resolve(agentOrchestrator, 'lib')}/$1`,
		},
		{
			find: '@delendai/agent-orchestrator',
			replacement: resolve(agentOrchestrator, 'index.ts'),
		},
		{
			find: '@delendai/adaptive-optimizer/public',
			replacement: resolve(adaptiveOptimizer, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/adaptive-optimizer\/lib\/(.*)$/,
			replacement: `${resolve(adaptiveOptimizer, 'lib')}/$1`,
		},
		{
			find: '@delendai/adaptive-optimizer',
			replacement: resolve(adaptiveOptimizer, 'index.ts'),
		},
		{
			find: '@delendai/project-health/public',
			replacement: resolve(projectHealth, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/project-health\/lib\/(.*)$/,
			replacement: `${resolve(projectHealth, 'lib')}/$1`,
		},
		{
			find: '@delendai/project-health',
			replacement: resolve(projectHealth, 'index.ts'),
		},
		{
			find: '@delendai/project-kpis/public',
			replacement: resolve(projectKpis, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/project-kpis\/lib\/(.*)$/,
			replacement: `${resolve(projectKpis, 'lib')}/$1`,
		},
		{
			find: '@delendai/project-kpis',
			replacement: resolve(projectKpis, 'index.ts'),
		},
		{
			find: '@delendai/quality-policy/public',
			replacement: resolve(qualityPolicy, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/quality-policy\/lib\/(.*)$/,
			replacement: `${resolve(qualityPolicy, 'lib')}/$1`,
		},
		{
			find: '@delendai/quality-policy',
			replacement: resolve(qualityPolicy, 'index.ts'),
		},
		{
			find: '@delendai/commit-policy/public',
			replacement: resolve(commitPolicy, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/commit-policy\/lib\/(.*)$/,
			replacement: `${resolve(commitPolicy, 'lib')}/$1`,
		},
		{
			find: '@delendai/commit-policy',
			replacement: resolve(commitPolicy, 'index.ts'),
		},
		{
			find: '@delendai/shared/i18n',
			replacement: resolve(shared, 'i18n/index.ts'),
		},
		{
			find: /^@mcp-vertex\/shared\/styles\/(.*)$/,
			replacement: resolve(shared, 'styles/$1'),
		},
		{
			find: '@delendai/container/public',
			replacement: resolve(container, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/container\/lib\/(.*)$/,
			replacement: `${resolve(container, 'lib')}/$1`,
		},
		{
			find: '@delendai/container',
			replacement: resolve(container, 'index.ts'),
		},
		{
			find: '@delendai/shared/styles',
			replacement: resolve(shared, 'styles/_index.scss'),
		},
		{
			find: /^@mcp-vertex\/shared\/components\/(.*)$/,
			replacement: resolve(shared, 'components/$1'),
		},
		{
			find: '@delendai/shared',
			replacement: resolve(shared, 'public/index.ts'),
		},
		{
			find: '@delendai/core/version',
			replacement: resolve(core, 'version.ts'),
		},
		{
			find: '@delendai/core/public',
			replacement: resolve(core, 'public/index.ts'),
		},
		{
			find: '@delendai/core/contracts',
			replacement: resolve(core, 'contracts/index.ts'),
		},
		{
			find: '@delendai/core/runtime',
			replacement: resolve(core, 'runtime/index.ts'),
		},
		{
			find: '@delendai/core/plugin',
			replacement: resolve(core, 'plugin/index.ts'),
		},
		{
			find: '@delendai/core/node',
			replacement: resolve(core, 'node/index.ts'),
		},
		{
			find: /^@mcp-vertex\/core\/lib\/(.*)$/,
			replacement: `${resolve(core, 'lib')}/$1`,
		},
		{ find: '@delendai/core', replacement: resolve(core, 'index.ts') },
		{
			find: '@delendai/proposals/public',
			replacement: resolve(proposals, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/proposals\/lib\/(.*)$/,
			replacement: `${resolve(proposals, 'lib')}/$1`,
		},
		{
			find: '@delendai/proposals',
			replacement: resolve(proposals, 'index.ts'),
		},
		{
			find: '@delendai/prompts-pack/public',
			replacement: resolve(promptsPack, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/prompts-pack\/lib\/(.*)$/,
			replacement: `${resolve(promptsPack, 'lib')}/$1`,
		},
		{
			find: '@delendai/prompts-pack',
			replacement: resolve(promptsPack, 'index.ts'),
		},
		{
			find: '@delendai/rules/public',
			replacement: resolve(rules, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/rules\/lib\/(.*)$/,
			replacement: `${resolve(rules, 'lib')}/$1`,
		},
		{
			find: '@delendai/rules',
			replacement: resolve(rules, 'index.ts'),
		},
		{
			find: '@delendai/memory/public',
			replacement: resolve(memory, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/memory\/lib\/(.*)$/,
			replacement: `${resolve(memory, 'lib')}/$1`,
		},
		{
			find: '@delendai/memory',
			replacement: resolve(memory, 'index.ts'),
		},
		{
			find: '@delendai/git/public',
			replacement: resolve(git, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/git\/lib\/(.*)$/,
			replacement: `${resolve(git, 'lib')}/$1`,
		},
		{
			find: '@delendai/git',
			replacement: resolve(git, 'index.ts'),
		},
		{
			find: '@delendai/forge/public',
			replacement: resolve(forge, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/forge\/lib\/(.*)$/,
			replacement: `${resolve(forge, 'lib')}/$1`,
		},
		{
			find: '@delendai/forge',
			replacement: resolve(forge, 'index.ts'),
		},
		{
			find: '@delendai/remote-provider-core/public',
			replacement: resolve(remoteProviderCore, 'public/index.ts'),
		},
		{
			find: '@delendai/remote-provider-core',
			replacement: resolve(remoteProviderCore, 'index.ts'),
		},
		{
			find: '@delendai/gitlab/public',
			replacement: resolve(gitlab, 'public/index.ts'),
		},
		{
			find: '@delendai/gitlab',
			replacement: resolve(gitlab, 'index.ts'),
		},
		{
			find: '@delendai/github/public',
			replacement: resolve(github, 'public/index.ts'),
		},
		{
			find: '@delendai/github',
			replacement: resolve(github, 'index.ts'),
		},
		{
			find: '@delendai/quality/public',
			replacement: resolve(quality, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/quality\/lib\/(.*)$/,
			replacement: `${resolve(quality, 'lib')}/$1`,
		},
		{
			find: '@delendai/quality',
			replacement: resolve(quality, 'index.ts'),
		},
		{
			find: '@delendai/refactor/public',
			replacement: resolve(refactor, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/refactor\/lib\/(.*)$/,
			replacement: `${resolve(refactor, 'lib')}/$1`,
		},
		{
			find: '@delendai/refactor',
			replacement: resolve(refactor, 'index.ts'),
		},
		{
			find: '@delendai/search/public',
			replacement: resolve(search, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/search\/lib\/(.*)$/,
			replacement: `${resolve(search, 'lib')}/$1`,
		},
		{
			find: '@delendai/search',
			replacement: resolve(search, 'index.ts'),
		},
		{
			find: '@delendai/notification/public',
			replacement: resolve(notification, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/notification\/lib\/(.*)$/,
			replacement: `${resolve(notification, 'lib')}/$1`,
		},
		{
			find: '@delendai/notification',
			replacement: resolve(notification, 'index.ts'),
		},
		{
			find: '@delendai/observability/public',
			replacement: resolve(observability, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/observability\/lib\/(.*)$/,
			replacement: `${resolve(observability, 'lib')}/$1`,
		},
		{
			find: '@delendai/observability',
			replacement: resolve(observability, 'index.ts'),
		},
		{
			find: '@delendai/docs/public',
			replacement: resolve(docs, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/docs\/lib\/(.*)$/,
			replacement: `${resolve(docs, 'lib')}/$1`,
		},
		{
			find: '@delendai/docs',
			replacement: resolve(docs, 'index.ts'),
		},
		{
			find: '@delendai/deps/public',
			replacement: resolve(deps, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/deps\/lib\/(.*)$/,
			replacement: `${resolve(deps, 'lib')}/$1`,
		},
		{
			find: '@delendai/deps',
			replacement: resolve(deps, 'index.ts'),
		},
		{
			find: '@delendai/security/public',
			replacement: resolve(security, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/security\/lib\/(.*)$/,
			replacement: `${resolve(security, 'lib')}/$1`,
		},
		{
			find: '@delendai/security',
			replacement: resolve(security, 'index.ts'),
		},
		{
			find: '@delendai/skills-pack/public',
			replacement: resolve(skillsPack, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/skills-pack\/lib\/(.*)$/,
			replacement: `${resolve(skillsPack, 'lib')}/$1`,
		},
		{
			find: '@delendai/skills-pack',
			replacement: resolve(skillsPack, 'index.ts'),
		},
		{
			find: '@delendai/prompts-pack/public',
			replacement: resolve(promptsPack, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/prompts-pack\/lib\/(.*)$/,
			replacement: `${resolve(promptsPack, 'lib')}/$1`,
		},
		{
			find: '@delendai/prompts-pack',
			replacement: resolve(promptsPack, 'index.ts'),
		},
		{
			find: '@delendai/diagram/public',
			replacement: resolve(diagram, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/diagram\/lib\/(.*)$/,
			replacement: `${resolve(diagram, 'lib')}/$1`,
		},
		{
			find: '@delendai/diagram',
			replacement: resolve(diagram, 'index.ts'),
		},
		{
			find: '@delendai/env/public',
			replacement: resolve(env, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/env\/lib\/(.*)$/,
			replacement: `${resolve(env, 'lib')}/$1`,
		},
		{
			find: '@delendai/env',
			replacement: resolve(env, 'index.ts'),
		},
		{
			find: '@delendai/i18n/public',
			replacement: resolve(i18n, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/i18n\/lib\/(.*)$/,
			replacement: `${resolve(i18n, 'lib')}/$1`,
		},
		{
			find: '@delendai/i18n',
			replacement: resolve(i18n, 'index.ts'),
		},
		{
			find: '@delendai/perf/public',
			replacement: resolve(perf, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/perf\/lib\/(.*)$/,
			replacement: `${resolve(perf, 'lib')}/$1`,
		},
		{
			find: '@delendai/perf',
			replacement: resolve(perf, 'index.ts'),
		},
		{
			find: '@delendai/tech-debt/public',
			replacement: resolve(techDebt, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/tech-debt\/lib\/(.*)$/,
			replacement: `${resolve(techDebt, 'lib')}/$1`,
		},
		{
			find: '@delendai/tech-debt',
			replacement: resolve(techDebt, 'index.ts'),
		},
		{
			find: '@delendai/link-check/public',
			replacement: resolve(linkCheck, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/link-check\/lib\/(.*)$/,
			replacement: `${resolve(linkCheck, 'lib')}/$1`,
		},
		{
			find: '@delendai/link-check',
			replacement: resolve(linkCheck, 'index.ts'),
		},
		{
			find: '@delendai/logs/public',
			replacement: resolve(logs, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/logs\/lib\/(.*)$/,
			replacement: `${resolve(logs, 'lib')}/$1`,
		},
		{
			find: '@delendai/logs',
			replacement: resolve(logs, 'index.ts'),
		},
		{
			find: '@delendai/audit/public',
			replacement: resolve(audit, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/audit\/lib\/(.*)$/,
			replacement: `${resolve(audit, 'lib')}/$1`,
		},
		{
			find: '@delendai/audit',
			replacement: resolve(audit, 'index.ts'),
		},
		{
			find: '@delendai/browser/public',
			replacement: resolve(browser, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/browser\/lib\/(.*)$/,
			replacement: `${resolve(browser, 'lib')}/$1`,
		},
		{
			find: '@delendai/browser',
			replacement: resolve(browser, 'index.ts'),
		},

		{
			find: '@delendai/prompt-eval/public',
			replacement: resolve(promptEval, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/prompt-eval\/lib\/(.*)$/,
			replacement: `${resolve(promptEval, 'lib')}/$1`,
		},
		{
			find: '@delendai/prompt-eval',
			replacement: resolve(promptEval, 'index.ts'),
		},
		{
			find: '@delendai/status-marker/public',
			replacement: resolve(statusMarker, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/status-marker\/lib\/(.*)$/,
			replacement: `${resolve(statusMarker, 'lib')}/$1`,
		},
		{
			find: '@delendai/status-marker',
			replacement: resolve(statusMarker, 'index.ts'),
		},
		{
			find: '@delendai/test-convention/public',
			replacement: resolve(testConvention, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/test-convention\/lib\/(.*)$/,
			replacement: `${resolve(testConvention, 'lib')}/$1`,
		},
		{
			find: '@delendai/test-convention',
			replacement: resolve(testConvention, 'index.ts'),
		},
		{
			find: '@delendai/web-fetch/public',
			replacement: resolve(webFetch, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/web-fetch\/lib\/(.*)$/,
			replacement: `${resolve(webFetch, 'lib')}/$1`,
		},
		{
			find: '@delendai/web-fetch',
			replacement: resolve(webFetch, 'index.ts'),
		},
		{
			find: '@delendai/test-policy/public',
			replacement: resolve(testPolicy, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/test-policy\/lib\/(.*)$/,
			replacement: `${resolve(testPolicy, 'lib')}/$1`,
		},
		{
			find: '@delendai/test-policy',
			replacement: resolve(testPolicy, 'index.ts'),
		},
		{
			find: '@delendai/usage-tracking/public',
			replacement: resolve(usageTracking, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/usage-tracking\/lib\/(.*)$/,
			replacement: `${resolve(usageTracking, 'lib')}/$1`,
		},
		{
			find: '@delendai/usage-tracking',
			replacement: resolve(usageTracking, 'index.ts'),
		},
		{
			find: '@delendai/auto-agent-selector/public',
			replacement: resolve(autoAgentSelector, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/auto-agent-selector\/lib\/(.*)$/,
			replacement: `${resolve(autoAgentSelector, 'lib')}/$1`,
		},
		{
			find: '@delendai/auto-agent-selector',
			replacement: resolve(autoAgentSelector, 'index.ts'),
		},
		{
			find: '@delendai/auto-plugin-selector/public',
			replacement: resolve(autoPluginSelector, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/auto-plugin-selector\/lib\/(.*)$/,
			replacement: `${resolve(autoPluginSelector, 'lib')}/$1`,
		},
		{
			find: '@delendai/auto-plugin-selector',
			replacement: resolve(autoPluginSelector, 'index.ts'),
		},
		{
			find: '@delendai/orchestrator-runner/public',
			replacement: resolve(orchestratorRunner, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/orchestrator-runner\/lib\/(.*)$/,
			replacement: `${resolve(orchestratorRunner, 'lib')}/$1`,
		},
		{
			find: '@delendai/orchestrator-runner',
			replacement: resolve(orchestratorRunner, 'index.ts'),
		},
		{
			find: '@delendai/api/public',
			replacement: resolve(api, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/api\/lib\/(.*)$/,
			replacement: `${resolve(api, 'lib')}/$1`,
		},
		{
			find: '@delendai/api',
			replacement: resolve(api, 'index.ts'),
		},
		{
			find: '@delendai/conventions/public',
			replacement: resolve(conventions, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/conventions\/lib\/(.*)$/,
			replacement: `${resolve(conventions, 'lib')}/$1`,
		},
		{
			find: '@delendai/conventions',
			replacement: resolve(conventions, 'index.ts'),
		},
		{
			find: '@delendai/database/public',
			replacement: resolve(database, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/database\/lib\/(.*)$/,
			replacement: `${resolve(database, 'lib')}/$1`,
		},
		{
			find: '@delendai/database',
			replacement: resolve(database, 'index.ts'),
		},
		{
			find: '@delendai/issues/public',
			replacement: resolve(issues, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/issues\/lib\/(.*)$/,
			replacement: `${resolve(issues, 'lib')}/$1`,
		},
		{
			find: '@delendai/issues',
			replacement: resolve(issues, 'index.ts'),
		},
		{
			find: '@delendai/cache/public',
			replacement: resolve(cache, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/cache\/lib\/(.*)$/,
			replacement: `${resolve(cache, 'lib')}/$1`,
		},
		{
			find: '@delendai/cache',
			replacement: resolve(cache, 'index.ts'),
		},
		{
			find: '@delendai/changelog/public',
			replacement: resolve(changelog, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/changelog\/lib\/(.*)$/,
			replacement: `${resolve(changelog, 'lib')}/$1`,
		},
		{
			find: '@delendai/changelog',
			replacement: resolve(changelog, 'index.ts'),
		},
		{
			find: '@delendai/completion/public',
			replacement: resolve(completion, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/completion\/lib\/(.*)$/,
			replacement: `${resolve(completion, 'lib')}/$1`,
		},
		{
			find: '@delendai/completion',
			replacement: resolve(completion, 'index.ts'),
		},
		{
			find: '@delendai/error-reporting/public',
			replacement: resolve(errorReporting, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/error-reporting\/lib\/(.*)$/,
			replacement: `${resolve(errorReporting, 'lib')}/$1`,
		},
		{
			find: '@delendai/error-reporting',
			replacement: resolve(errorReporting, 'index.ts'),
		},
		{
			find: '@delendai/issues-triage/public',
			replacement: resolve(issuesTriage, 'public/index.ts'),
		},
		{
			find: /^@mcp-vertex\/issues-triage\/lib\/(.*)$/,
			replacement: `${resolve(issuesTriage, 'lib')}/$1`,
		},
		{
			find: '@delendai/issues-triage',
			replacement: resolve(issuesTriage, 'index.ts'),
		},
		{
			find: '@delendai/client/public',
			replacement: resolve(client, 'public/index.ts'),
		},
		{
			find: '@delendai/client/node',
			replacement: resolve(client, 'node/index.ts'),
		},
		{
			find: /^@mcp-vertex\/client\/lib\/(.*)$/,
			replacement: `${resolve(client, 'lib')}/$1`,
		},
		{
			find: '@delendai/client',
			replacement: resolve(client, 'index.ts'),
		},
		{
			find: '@delendai/ui-extension/public',
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
			find: '@delendai/ui-extension',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/index.ts',
			),
		},
		{
			find: '@delendai/ide/public',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/public/index.ts',
			),
		},
		{
			find: '@delendai/ide',
			replacement: resolve(
				workspaceRoot,
				'packages/ui-extension/src/index.ts',
			),
		},
	];
};
