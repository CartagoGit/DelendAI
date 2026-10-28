/**
 * managed-lazy-catalog.generated.ts — GENERATED, do not edit by hand.
 *
 * Regenerate: bun tools/scripts/generate/managed-lazy-catalog.script.ts
 * The source is the eager assembled plugin registration catalog; the
 * runtime consumes this compact index without importing every plugin.
 */
import type { IToolDisclosureLevel } from '../contracts/interfaces/tool-surface.interface';

export interface IManagedLazyPluginCatalogEntry {
	readonly id: string;
	readonly packageSpecifier: string;
	readonly toolIds: readonly string[];
	readonly promptIds: readonly string[];
	readonly resourceIds: readonly string[];
	readonly knowledgeIds: readonly string[];
	readonly skillIds: readonly string[];
	readonly dependencies: readonly string[];
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
	readonly startupActivation?: boolean | undefined;
	/**
	 * The start-up configuration check must import this plugin even
	 * when the user configured nothing for it: its options cannot be
	 * empty, or it checks the configuration of the server.
	 */
	readonly startupCheck?: boolean | undefined;
	readonly toolDisclosure?:
		| Readonly<Record<string, IToolDisclosureLevel>>
		| undefined;
	/** Each tool's own one-line summary: a search must tell the tools of an inactive plugin apart. */
	readonly toolSummaries?: Readonly<Record<string, string>> | undefined;
	/**
	 * The environment variables the plugin declares in its options schema
	 * (`env:VAR` markers), read at generation time so `init` can warn about
	 * them without importing the plugin. Absent when it declares none.
	 */
	readonly environmentRequirements?:
		| readonly {
				readonly var: string;
				readonly plugin: string;
				readonly capability: string;
				readonly provider?: string;
				readonly required: boolean;
		  }[]
		| undefined;
}

const tools = (
	id: string,
	packageSpecifier: string,
	toolIds: readonly string[],
	promptIds: readonly string[],
	resourceIds: readonly string[],
	knowledgeIds: readonly string[],
	skillIds: readonly string[],
	dependencies: readonly string[],
	metadata: Pick<
		IManagedLazyPluginCatalogEntry,
		| 'summary'
		| 'tags'
		| 'startupActivation'
		| 'startupCheck'
		| 'toolDisclosure'
		| 'toolSummaries'
		| 'environmentRequirements'
	> = {},
): IManagedLazyPluginCatalogEntry => ({
	id,
	packageSpecifier,
	...metadata,
	toolIds,
	promptIds,
	resourceIds,
	knowledgeIds,
	skillIds,
	dependencies,
});

export const MANAGED_LAZY_PLUGIN_CATALOG: readonly IManagedLazyPluginCatalogEntry[] =
	[
		tools(
			'adaptive-optimizer',
			'@delendai/adaptive-optimizer',
			['adaptive_facade', 'optimize_run', 'activation_metrics'],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Adaptive optimizer: cheaply rank model, plugin-set and prompt candidates with explicit budget and consent guards.',
				tags: ['optimizer', 'adaptive', 'prompt', 'f00168'],
				toolSummaries: {
					adaptive_facade:
						'Route proposal intents to the preferred stable tool path using observed success, tokens, calls, latency and side-effect risk.',
					optimize_run:
						'Rank model/plugin-set/prompt candidates with multi-objective scoring, explicit consent and explicit budget guards.',
					activation_metrics:
						'optimize_run activation count and p95 response-payload bytes this process, with an explicit no-samples state.',
				},
			},
		),
		tools(
			'agent-orchestrator',
			'@delendai/agent-orchestrator',
			['plan', 'dispatch', 'classify'],
			[],
			[],
			['agent-orchestrator-overview'],
			[],
			[],
			{
				summary:
					'Workflow policy plugin: single / linear / swarm / auto modes with token budgets, iteration caps, and mid-task subagent rotation.',
				tags: ['orchestrator', 'policy', 'workflow', 'subagent'],
				toolSummaries: {
					plan: 'Plan a task under the policy (read-only, dispatches nothing): mode, ordered steps, budgets and rotation.',
					dispatch:
						'Plan and execute a task via the configured orchestration policy. Linear-only in S2; swarm parallel lands in S3.',
					classify:
						"Classify a task without planning. Returns the inner mode, the classifier's reason, and confidence. Read-only.",
				},
			},
		),
		tools(
			'api',
			'@delendai/api',
			['api_call', 'api_validate', 'api_mock'],
			[],
			[],
			[
				'api-validate-overview',
				'api-mock-overview',
				'api-plugin-catalog',
			],
			[],
			[],
			{
				summary: 'REST/GraphQL API surface for delendai plugins.',
				tags: ['api', 'surface'],
				toolSummaries: {
					api_call:
						'Build a request from an OpenAPI spec and send via web-fetch.',
					api_validate:
						'Validate an HTTP response against an OpenAPI response schema.',
					api_mock:
						'Generate an example response for one OpenAPI operation directly from the spec.',
				},
			},
		),
		tools(
			'audit',
			'@delendai/audit',
			[
				'audit_plan',
				'audit_consolidate',
				'audit_run',
				'audit_close',
				'self_audit',
			],
			[],
			[],
			['audit-overview', 'audit-scopes'],
			[],
			[],
			{
				summary:
					'Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.',
				tags: ['audit', 'multi-model', 'self-improvement'],
				toolSummaries: {
					audit_plan:
						'Return the canonical audit brief (markdown) — supports general / specific / monorepo modes. Paste it into a fresh model session to elicit an audit in the format `@delendai/audit` expects.',
					audit_consolidate:
						'Read every *.md audit in the audits directory, parse + deduplicate + average scores, and return the master view + markdown. By default, auto-scaffold a native plan with linked fix proposals when the `proposals` plugin is loaded and `autoScaffoldProposals` is enabled.',
					audit_run:
						'Dispatch the audit brief (general / specific / monorepo modes) to one or more LLM targets in parallel, save the markdown reports, consolidate the findings into a native plan by default, and scaffold linked child proposals for every actionable severity band (FATAL/BAD/MINOR).',
					self_audit:
						'Aggregate self-audit findings into one ranked action backlog.',
				},
			},
		),
		tools(
			'audit-orchestrator',
			'@delendai/audit-orchestrator',
			['orchestrate_plan', 'orchestrate_run'],
			[],
			[],
			['audit-orchestrator-overview'],
			[],
			['agent-orchestrator'],
			{
				summary:
					'Orchestrates implementation work generated by project-agnostic audit plan proposals.',
				tags: ['audit', 'orchestrator', 'subagent', 'proposals'],
				toolSummaries: {
					orchestrate_plan:
						'Derive and preview implementation tasks from an audit plan proposal.',
					orchestrate_run:
						'Execute implementation tasks derived from an audit plan through the host subagent port.',
				},
			},
		),
		tools(
			'auto-agent-selector',
			'@delendai/auto-agent-selector',
			[
				'auto_status',
				'auto_recommend',
				'auto_record',
				'auto_evaluate',
				'auto_run',
			],
			[],
			[],
			['auto-agent-selector'],
			[],
			[],
			{
				summary:
					'Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation).',
				tags: ['routing', 'agents'],
				toolSummaries: {
					auto_status:
						'List reachable LLM/agent providers (CLI + API keys), cheapest-first, plus missing ones with a one-command fix.',
					auto_recommend:
						'Rank reachable providers for a task and recommend the best-value one (cost↔quality dial + optional pin, measured win-rates). Advisory: you decide.',
					auto_record:
						'Record a task outcome (success/failure) for a provider so future recommendations learn which one actually wins.',
					auto_evaluate:
						'Evaluate observed provider win-rates and flag newly reachable providers for review (no spend).',
					auto_run:
						'Plan the cheapest-capable → escalate-up route for a task (run step 1; on gate failure escalate to a stronger provider, within your cost ceiling).',
				},
			},
		),
		tools(
			'auto-plugin-selector',
			'@delendai/auto-plugin-selector',
			['plugins_recommend'],
			[],
			[],
			['auto-plugin-selector-overview'],
			[],
			[],
			{
				summary:
					'Recommends the best plugin set for this project from its signals (manifest, files, git, task).',
				tags: ['plugins', 'catalog', 'routing'],
				toolSummaries: {
					plugins_recommend:
						'Recommend the best plugin set for the project signals (deterministic scorer, no API key required) + structured diff vs current + optional LLM rationale.',
				},
			},
		),
		tools(
			'browser',
			'@delendai/browser',
			[
				'browser_open',
				'browser_screenshot',
				'browser_query',
				'browser_click',
				'browser_fill',
				'browser_assert',
				'browser_a11y',
				'browser_verify_page',
			],
			[],
			[],
			[],
			[],
			[],
			{
				summary: 'Headless browser automation tools.',
				tags: ['browser', 'automation'],
				toolSummaries: {
					browser_open:
						'Open an HTTP(S) page through the configured browser driver.',
					browser_screenshot:
						'Capture a page screenshot into the private plugin cache.',
					browser_query:
						'Query bounded DOM matches through the configured browser driver.',
					browser_click:
						'Click an element matched by a CSS selector or `text=<exact>`.',
					browser_fill:
						'Fill an input or textarea matched by selector.',
					browser_assert:
						'Assert a text/visibility/count/url/title condition; returns IFinding[] on failure.',
					browser_a11y:
						'Run axe-core against a URL; return normalized IFinding[].',
					browser_verify_page:
						'Verify a rendered page has an html root, stylesheet, and nav.',
				},
			},
		),
		tools(
			'cache',
			'@delendai/cache',
			['cache_gc'],
			[],
			[],
			['cache-eviction-overview'],
			[],
			[],
			{
				summary:
					'Cache-eviction rules and lifecycle for plugin scratch dirs.',
				tags: ['cache', 'lifecycle'],
				toolSummaries: {
					cache_gc:
						'Preview (dry-run) or apply cache eviction across every registered rule.',
				},
			},
		),
		tools(
			'commit-policy',
			'@delendai/commit-policy',
			[
				'commit_policy_refresh_branch_protection',
				'commit_policy_commit',
				'commit_policy_push',
				'commit_policy_run',
				'commit_policy_storms',
				'commit_policy_settlement',
				'commit_policy_work_ref',
			],
			[],
			[],
			['commit-policy'],
			[],
			[],
			{
				summary:
					'Commit-authority plugin: configurable identity, cadence and audit-trail policy wrapping the git plugin primitives. Off by default — opt in via plugins.commit-policy.options.',
				tags: ['commit', 'policy', 'git', 'agent', 'f00181'],
				startupCheck: true,
				toolDisclosure: {
					commit_policy_settlement: 'administrative',
					commit_policy_work_ref: 'contextual',
				},
				toolSummaries: {
					commit_policy_refresh_branch_protection:
						'Refresh protected branches from the configured forge provider.',
					commit_policy_commit:
						'Commit through the policy engine: resolves identity, appends audit trail, refuses protected branches + disabled commit.',
					commit_policy_push:
						'Push through the policy engine: respects protectedBranches, force policy (with-lease|allow|never), and push.enabled master switch.',
					commit_policy_run:
						'Manually fire any configured trigger (manual always available; slice/threshold/interval require cadence.triggers). Pass `dryRun: true` to preview the change without executing any git operation.',
					commit_policy_storms:
						'Read the live StormDetector snapshot: per (trigger, code) repeat counts, sample proposal IDs, and a one-line repair hint. x00419 lets agents consume their own stderr and file `kind: fix` proposals without a human intermediary.',
					commit_policy_settlement:
						'Read or steer the settlement phase commit-policy gates on: status, enter (only with no active workers), or complete with the validate result.',
					commit_policy_work_ref:
						'Checkpoint exact claimed files to a policy-derived non-head WIP ref or materialize them back without moving HEAD or the real index.',
				},
			},
		),
		tools(
			'completion',
			'@delendai/completion',
			['report_complete', 'status', 'clear'],
			[],
			[],
			['task-completion'],
			[],
			[],
			{
				summary:
					'Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.',
				tags: ['completion', 'notification'],
				toolSummaries: {
					report_complete:
						'Declare the original task fully done and reviewed; records it durably and pushes a notification so the human knows the agent is idle awaiting explicit instruction.',
					status: 'List durable task-completion records (agents that declared their original task done + reviewed and are idle).',
					clear: 'Delete a task-completion record by taskId (the operator acknowledges the completion and clears it from the idle list).',
				},
			},
		),
		tools(
			'container',
			'@delendai/container',
			[
				'container_inspect',
				'container_logs',
				'container_lint',
				'container_build',
				'k8s_apply',
				'container_pull',
				'container_run',
				'container_exec',
				'container_compose',
				'container_network',
				'container_volume',
			],
			[],
			[],
			[
				'container-inspect-usage',
				'container-logs-usage',
				'container-lint-usage',
			],
			[],
			[],
			{
				summary:
					'Container inspection + lint (docker ps/images, k8s, Dockerfile rules).',
				tags: ['container', 'docker', 'kubernetes'],
				toolSummaries: {
					container_inspect:
						'Inspect local Docker containers/images or Kubernetes pods through the host CLI. Read-only.',
				},
			},
		),
		tools(
			'context-for-change',
			'@delendai/context-for-change',
			['context_for_change'],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.',
				tags: ['context', 'orchestration', 'compact', 'f00165'],
				toolSummaries: {
					context_for_change:
						'Combine diff, symbols, tests, docs and conventions into one bounded task-oriented context packet.',
				},
			},
		),
		tools(
			'conventions',
			'@delendai/conventions',
			[
				'conventions_classify',
				'conventions_suggest_path',
				'conventions_explain_path',
				'conventions_check_architecture',
				'conventions_check',
			],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Repo file-convention enforcement (interface, constant, service, tool …).',
				tags: ['conventions'],
				toolSummaries: {
					conventions_classify:
						'Classify repo-relative paths into file-convention roles (pure, no scan).',
					conventions_suggest_path:
						'Given a role, a package and a name, answer with the path the classifier agrees with.',
					conventions_explain_path:
						'Explain a path: its role, the rule that assigned it, its layer, and what that layer may not import.',
					conventions_check_architecture:
						'Report imports that break the declared layer graph, as the enforcing lints see them.',
					conventions_check:
						'Scan the workspace and report file-convention drift (per-role counts + unmatched files).',
				},
			},
		),
		tools(
			'database',
			'@delendai/database',
			['db_erd', 'db_schema', 'db_probe', 'db_query', 'db_explain'],
			[],
			[],
			['database-erd-usage'],
			[],
			[],
			{
				summary:
					'Database schema/introspection tools (read-only, offline).',
				tags: ['database', 'schema'],
				toolSummaries: {
					db_erd: 'Render the database schema as a deterministic mermaid ERD.',
					db_schema:
						'List every user table in the database (columns, indexes, foreign keys). Read-only.',
					db_probe:
						'Probe the database connection (driver kind, presence) without running any query.',
					db_query:
						'Run a guarded SQL query. Read-only by default; write/DDL blocked unless explicitly confirmed.',
					db_explain:
						'Return the EXPLAIN plan for a read-only SQL statement without executing it.',
				},
				environmentRequirements: [
					{
						var: 'DATABASE_URL',
						plugin: 'database',
						capability: 'Database DSN',
						provider: 'database',
						required: true,
					},
				],
			},
		),
		tools(
			'deps',
			'@delendai/deps',
			[
				'deps_list',
				'deps_check',
				'deps_outdated',
				'deps_audit',
				'deps_licenses',
				'deps_polyglot',
				'deps_tree',
			],
			[],
			[],
			['deps-usage'],
			[],
			[],
			{
				summary:
					'Dependency inventory + offline health (deps_list, deps_check, deps_audit, deps_licenses, deps_tree).',
				tags: ['deps', 'licenses'],
				toolSummaries: {
					deps_list:
						'Inventory the manifest dependencies (name, range, section).',
					deps_check:
						'Offline dependency health: missing lockfile, unpinned ranges, cross-section duplicates.',
					deps_outdated:
						"Resolve each dep's latest npm version and flag stale ones. Opt-in, network.",
					deps_audit:
						'Scan dependencies for known CVEs via bun audit (normalized findings). Opt-in, network.',
					deps_licenses:
						'Flag dependencies with copyleft/proprietary/unknown/missing licenses (offline).',
					deps_polyglot:
						'List Python/Rust/Go dependencies (pyproject.toml, Cargo.toml, go.mod) if present.',
					deps_tree:
						'Build a dependency tree from the manifest + lockfile (capped depth).',
				},
			},
		),
		tools(
			'diagram',
			'@delendai/diagram',
			[
				'diagram_deps',
				'diagram_modules',
				'diagram_erd',
				'diagram_proposals',
			],
			[],
			[],
			['diagram-usage'],
			[],
			[],
			{
				summary:
					'Diagram generator (mermaid, dot) from code structure.',
				tags: ['diagram', 'docs'],
				toolSummaries: {
					diagram_deps:
						'Render the workspace internal dependency graph as a mermaid flowchart.',
					diagram_modules:
						'Render a single package file-level module graph as a mermaid flowchart.',
					diagram_erd:
						'Render an `IDatabaseSchema` (from the database plugin) as a mermaid erDiagram.',
					diagram_proposals:
						'Render the proposal status DFA as a mermaid stateDiagram, optionally annotated with current per-status counts.',
				},
			},
		),
		tools(
			'docs',
			'@delendai/docs',
			['docs_list', 'docs_read', 'docs_search', 'docs_generate'],
			[],
			[],
			['docs-usage'],
			[],
			[],
			{
				summary: 'Doc generation, search, and rendered catalog.',
				tags: ['docs', 'catalog'],
				toolSummaries: {
					docs_list:
						'Catalogue the project markdown docs (path + title), low-token.',
					docs_read:
						'Read one project doc by its workspace-relative path.',
					docs_search:
						'[deprecated] Use search_search { roots: ["docs"] } instead.',
					docs_generate:
						'Generate markdown summaries for src/**/*.ts modules.',
				},
			},
		),
		tools(
			'env',
			'@delendai/env',
			['env_check', 'env_explains'],
			[],
			[],
			['env-usage'],
			[],
			[],
			{
				summary:
					'Environment config validation (.env check + schema + env_explains).',
				tags: ['env', 'config'],
				toolSummaries: {
					env_check:
						'Validate a .env file: duplicate/empty/malformed keys + missing required vars. Offline.',
					env_explains:
						'For a parsed .env, report which plugin capabilities are unlocked vs blocked by missing env vars. Pure over injected requirements catalog.',
				},
			},
		),
		tools(
			'error-reporting',
			'@delendai/error-reporting',
			['report_status', 'diagnose_log'],
			[],
			[],
			['error-reporting-surface'],
			[],
			[],
			{
				summary:
					'Automatic delendai error reporting, on by default and announced at every start: opens de-duplicated GitHub issues for delendai-internal failures only; one config line turns it off.',
				tags: ['error-reporting', 'github', 'issues'],
				startupActivation: true,
				toolSummaries: {
					report_status:
						'Show the auto error-reporting state (enabled, target repo, recent reports).',
					diagnose_log:
						'Diagnose a pasted MCP server log: probable cause and next action per pattern.',
				},
			},
		),
		tools(
			'external-mcps',
			'@delendai/external-mcps',
			[
				'catalog',
				'validate_config',
				'discover',
				'suggest',
				'ack',
				'status',
				'call',
				'verify_result',
			],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Compose third-party MCP servers through the catalog + human ack.',
				tags: ['external-mcps', 'composition'],
				toolSummaries: {
					catalog:
						'Search the external MCP server catalog (compact id+category+one-liner rows; detail per id).',
					validate_config:
						'Dry-run a proposed external-servers config patch against the schema — never writes.',
					discover:
						'Live npm search for external MCP servers — OFF unless allowDiscoverySearch is enabled.',
					suggest:
						'Propose a config patch (RFC 6902) for external servers matching a free-text need — never writes.',
					ack: 'Record the human accept/reject for an external-server activation, or list pending acks.',
					status: 'Per-declared-server subprocess status: running, session, pid, bootedAt, lastError.',
					call: 'Invoke ext.<server>.<tool> on a declared external MCP server (lazy-boots the child).',
					verify_result:
						'Check files produced from an external answer against the project contract; conflicts resolve to the project.',
				},
			},
		),
		tools(
			'forge',
			'@delendai/forge',
			[
				'pr_list',
				'pr_show',
				'ci_status',
				'issue_list',
				'issue_show',
				'pr_create',
				'pr_comment',
				'issue_create',
				'delendai_issue_create',
				'release',
				'search_code',
			],
			[],
			[],
			['forge-surface'],
			[],
			[],
			{
				summary: 'Forge (GitHub/GitLab) wrappers — PRs, CI, issues.',
				tags: ['forge', 'git', 'ci'],
				toolSummaries: {
					pr_list:
						'List remote pull requests or merge requests with CI summary.',
					pr_show:
						'Show one pull request or merge request with checks.',
					ci_status:
						'Show workflow or pipeline runs, jobs and failing logs.',
					issue_list:
						'List remote issues with state, labels and author.',
					issue_show: 'Show one remote issue with body and comments.',
					pr_create:
						'Create a pull request or merge request with explicit confirmation.',
					pr_comment:
						'Comment on a pull request or merge request with explicit confirmation.',
					issue_create:
						'Create a remote issue with explicit confirmation.',
					delendai_issue_create:
						'Create an internal delendai issue in the canonical delendai repository.',
					release:
						'Create a forge release from a tag with explicit confirmation.',
					search_code: 'Run remote code search on the origin forge.',
				},
			},
		),
		tools(
			'git',
			'@delendai/git',
			[
				'status',
				'changed',
				'diff',
				'log',
				'blame',
				'show',
				'worktree',
				'changelog',
				'commit',
				'push',
				'pr_list',
				'pr_view',
			],
			[],
			[],
			['git-orientation'],
			[],
			[],
			{
				summary:
					'Git wrappers (PR list/view, diff, changelog, extended).',
				tags: ['git', 'changelog'],
				toolSummaries: {
					status: 'Branch + working-tree status (clean flag + entries).',
					changed: 'List of changed file paths in the working tree.',
					diff: 'Diff --stat (optionally staged or scoped to a path).',
					log: 'Recent commits (hash + subject).',
					blame: 'Per-line authorship for a tracked file (optionally a line range).',
					show: 'Commit metadata + --stat summary for a ref (no full patch).',
					worktree:
						'List existing git worktrees for this repo (read-only).',
					changelog:
						'Conventional-commit changelog + inferred semver bump for a range.',
					commit: 'Stage and commit files with a Conventional Commit message.',
					push: 'Push the current branch, optionally with --force-with-lease.',
					pr_list:
						'List open pull requests (number, title, branch, url) via gh. Opt-in, network.',
					pr_view:
						'View a pull request with its CI check rollup via gh. Opt-in, network.',
				},
			},
		),
		tools(
			'github',
			'@delendai/github',
			[],
			[],
			[],
			['github-provider-context'],
			[],
			[],
			{
				summary:
					'GitHub read-only provider context, HTTP client and remote resource tools.',
				tags: ['github', 'provider'],
			},
		),
		tools(
			'gitlab',
			'@delendai/gitlab',
			[],
			[],
			[],
			['gitlab-provider-context'],
			[],
			[],
			{
				summary:
					'GitLab read-only provider context, HTTP client and resource tools.',
				tags: ['gitlab', 'provider'],
			},
		),
		tools(
			'i18n',
			'@delendai/i18n',
			['i18n_check', 'i18n_validate'],
			[],
			[],
			['i18n-usage'],
			[],
			[],
			{
				summary:
					'i18n key/interpolation validation across locale JSON files.',
				tags: ['i18n', 'l10n'],
				toolSummaries: {
					i18n_check:
						'Flag missing keys, unused keys, and placeholder mismatches across locale JSON files. Offline.',
					i18n_validate:
						'Validate interpolation and ICU consistency across locale JSON files. Offline.',
				},
			},
		),
		tools(
			'impact-analysis',
			'@delendai/impact-analysis',
			['impact_analyze', 'tests_for_change'],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Bounded impact analysis and test selection across changed symbols, dependents and related specs.',
				tags: ['impact', 'tests', 'f00169'],
				toolSummaries: {
					impact_analyze:
						'Estimate the impact of a change by deriving changed symbols, lexical dependents, affected packages, related tests and a bounded risk level.',
					tests_for_change:
						'Select the most relevant tests for a change slice and surface a small sample of explicitly skipped tests.',
				},
			},
		),
		tools(
			'issues',
			'@delendai/issues',
			['setup_github'],
			[],
			[],
			['issues-needs-repo-config'],
			[],
			['proposals'],
			{
				summary:
					'Issue tracker (GitHub) integration — list/fetch/analyze/ingest/resolve.',
				tags: ['issues', 'forge', 'triage'],
				toolSummaries: {
					setup_github:
						'Guided setup for the issues plugin (repo + auth tier + config).',
				},
			},
		),
		tools(
			'link-check',
			'@delendai/link-check',
			['link_check'],
			[],
			[],
			['link-check-usage'],
			[],
			[],
			{
				summary: 'Markdown link checker.',
				tags: ['docs', 'links'],
				toolSummaries: {
					link_check:
						'Verify markdown relative-link + anchor integrity across the workspace. Offline (external links never fetched).',
				},
			},
		),
		tools(
			'logs',
			'@delendai/logs',
			[
				'query',
				'tail',
				'errors_tail',
				'subscribe',
				'correlate',
				'redact_test',
				'log',
				'search',
				'incidents',
			],
			[],
			[],
			['logs-operational-event-log', 'logs-error-collector'],
			[],
			[],
			{
				summary: 'Structured logs reader (tail, query, redact).',
				tags: ['logs', 'observability'],
				startupActivation: true,
				toolSummaries: {
					query: 'Query redacted append-only MCP log events with filters and cursor pagination.',
					tail: 'Return the newest redacted MCP log events.',
					errors_tail:
						'Return the newest curated error/anomaly events — start here when auditing or debugging.',
					subscribe:
						'Return recent events in the shape consumed by the logs SSE endpoint.',
					correlate:
						'Build a timeline for one taskId or agent and flag long gaps.',
					redact_test:
						'Audit how the shared secret redactor treats a sample payload.',
					log: 'Record a structured incident (severity + incidentType + message) into the redacted event log.',
					search: 'Full-text / regex search over event summary, local error diagnostics, args and result.',
					incidents:
						'Cluster recurring failing events by tool plus redacted error fingerprint so the same bug surfaces once with a count.',
				},
			},
		),
		tools(
			'memory',
			'@delendai/memory',
			[
				'compact',
				'compaction_check',
				'checkpoint_packet',
				'save',
				'recall',
				'list',
				'forget',
				'export',
				'import',
			],
			[],
			[],
			['memory-usage'],
			[],
			[],
			{
				summary:
					'Persistent memory store (BM25 + recall, save, search).',
				tags: ['memory', 'persistence'],
				startupActivation: true,
				toolSummaries: {
					compact:
						'Distil carried working-state into a compact session digest; drop the noisy tail.',
					compaction_check:
						'Check whether the carried context tail is worth compacting now (deterministic).',
					checkpoint_packet:
						'Rehydrate the latest explicit session digest as a bounded continuation packet.',
					save: 'Save (or update) a titled note with optional tags.',
					recall: 'Recall notes by free-text query and/or tags (newest first).',
					list: 'List note ids, titles and tags (cheap index; paginated).',
					forget: 'Delete a note by id.',
					export: 'Export the full note store as a JSON or NDJSON snapshot.',
					import: 'Import a previously exported snapshot (replace or merge).',
				},
			},
		),
		tools(
			'notification',
			'@delendai/notification',
			['notify_status', 'await_lock'],
			[],
			[],
			['lock-notifications'],
			[],
			[],
			{
				summary: 'Notification + lock-await primitives.',
				tags: ['notification', 'concurrency'],
				toolSummaries: {
					notify_status:
						'Lock-release notifier: pushes notifications/message when a watched lock frees, so agents stop polling.',
					await_lock:
						'Wait until a task lock is released (or timeout), so agents stop polling agent_lock status.',
				},
			},
		),
		tools(
			'observability',
			'@delendai/observability',
			[
				'obs_errors',
				'obs_correlate',
				'obs_health',
				'obs_runtime_metrics',
			],
			[],
			[],
			['observability-correlate-usage'],
			[],
			[],
			{
				summary: 'Observability surface (metrics, errors, telemetry).',
				tags: ['observability'],
				toolSummaries: {
					obs_errors:
						'List recent issues from a Sentry/Datadog source via web-fetch.',
					obs_correlate:
						'Correlate remote observability issues with recent local logs.',
					obs_health:
						'Summarize local trace groups and release crash-free rates from observability logs.',
					obs_runtime_metrics:
						'Call count and p95 response-payload bytes across obs_trace/obs_release_health this process, with an explicit no-samples state.',
				},
			},
		),
		tools(
			'orchestrator-runner',
			'@delendai/orchestrator-runner',
			[
				'healthcheck_providers',
				'advise_routing',
				'get_quota',
				'accounts',
				'discover_providers',
				'onboard_agent',
				'bootstrap_providers',
				'invoke',
				'cancel_invocation',
				'format_handoff',
				'list_models',
				'set_provider_state',
				'advise_spend',
			],
			[],
			[],
			['orchestrator-runner-routing'],
			[],
			['usage-tracking'],
			{
				summary: 'Orchestrator-runner runtime utilities.',
				tags: ['orchestrator', 'runner'],
				toolSummaries: {
					healthcheck_providers:
						'Probe each configured provider CLI on PATH and report install/auth/model availability.',
					advise_routing:
						'Score the provider roster for a task and advise which provider to route to (no spend).',
					get_quota:
						'Read what each account has left per window, as its providers reported it on their last calls.',
					accounts:
						'List the accounts the roster runs on: modes, isolation, pools held and the last hop.',
					discover_providers:
						"With the user's consent, probe the host PATH for known provider CLIs and report which are installed vs missing.",
					onboard_agent:
						'Make the project able to use any agent: look it up, draft its declaration, write it, prove it with consent.',
					bootstrap_providers:
						'Run the provider bootstrap wizard: probe, draft a roster, and return a prose brief + config patch.',
					invoke: 'Execute a task on the best provider (with fallback). Gated by executeApi + a signed confirmation token — never spends silently.',
					cancel_invocation:
						'Cancel an in-flight invocation by id, applying the per-kind cancellation ladder.',
					format_handoff:
						'Format a routing decision into a ready-to-run CLI command or curl template (no spend).',
					list_models:
						'Enumerate the merged provider roster with capability profiles and current reachability.',
					set_provider_state:
						'Manually override a provider’s availability (e.g. force unavailable until a time).',
					advise_spend:
						'Analyse recorded spend + limit status and recommend non-destructive cost actions (risk-graded).',
				},
			},
		),
		tools(
			'perf',
			'@delendai/perf',
			['perf_bench', 'perf_bundle', 'perf_profile'],
			[],
			[],
			['perf-usage'],
			[],
			[],
			{
				summary: 'Performance bench/bundle/profile tools.',
				tags: ['perf', 'benchmark'],
				toolSummaries: {
					perf_bench:
						'Run named benchmark samples, compute ops/s, and compare against an optional inline baseline.',
					perf_bundle:
						'Measure files matching globs and flag those over per-file / total byte budgets. Offline.',
					perf_profile:
						'Capture a bounded hotspot profile when a profiler is available, else skip with an install hint.',
				},
			},
		),
		tools(
			'project-health',
			'@delendai/project-health',
			['project_health'],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Compact project-health aggregator: cheap summary first, lazy domain details on demand.',
				tags: ['health', 'aggregation', 'f00166'],
				toolSummaries: {
					project_health:
						'Cheap project-health summary plus lazy routing to the real security, deps, quality and debt tools.',
				},
			},
		),
		tools(
			'project-kpis',
			'@delendai/project-kpis',
			['project_kpis'],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Versioned project KPI snapshots and observability views across health, usage, economics and delivery.',
				tags: ['kpi', 'observability', 'economics', 'project-health'],
				toolSummaries: {
					project_kpis:
						'Bounded KPI views across snapshot, history, usage, economics, models, agents, plugins, errors, efficiency and audit.',
				},
			},
		),
		tools(
			'prompt-eval',
			'@delendai/prompt-eval',
			['eval_run', 'eval_report'],
			[],
			[],
			['prompt-eval'],
			[],
			[],
			{
				summary: 'Prompt-eval harness (golden prompts, scoring).',
				tags: ['prompts', 'eval'],
				toolSummaries: {
					eval_run:
						'Evaluate an explicitly approved prompt across reachable providers.',
					eval_report:
						'Score a list of eval attempts and emit a ranked cost×quality report.',
				},
			},
		),
		tools(
			'prompts-pack',
			'@delendai/prompts-pack',
			[],
			[
				'explain-this-code',
				'generate-docstrings',
				'write-tests-for',
				'review-this-diff',
				'security-audit-this-file',
				'optimize-this',
			],
			[],
			['prompts-pack-overview'],
			[],
			[],
			{
				summary:
					'Project-aware MCP prompts (explain-this-code, write-tests-for, review-this-diff, etc.).',
				tags: ['prompts'],
			},
		),
		tools(
			'proposals',
			'@delendai/proposals',
			[
				'agent_lock',
				'agents_lock_diagnose',
				'agent_worktree',
				'branch_status',
				'branch_gc',
				'swarm_hygiene',
				'task_queue',
				'sync_proposals',
				'get_proposal_workflow',
				'proposal_get',
				'round_context',
				'agent_names',
				'continue_proposal',
				'auto_work',
				'plan',
				'delegate',
				'proposal_transition',
				'proposals_close_plan',
				'create_proposal',
				'close_slice',
				'proposal_review',
				'review_queue',
				'review_claim',
				'proposal_board',
				'proposal_adopt',
				'inherit_host_instructions',
				'incident_proposals',
				'auto_fix_queue',
				'state_health',
				'state_repair',
				'compact_status',
				'proposal_stale_list',
				'agent_lock_release_orphan',
				'proposal_force_transition',
				'proposal_reconcile_folder',
				'proposal_diagnose',
				'proposals_db_status',
				'proposals_db_doctor',
				'proposals_db_reconcile',
				'proposals_db_rebuild',
				'proposals_db_verify',
				'proposals_db_diff',
				'proposals_conflicts',
				'proposals_db_quarantine_list',
				'proposals_db_quarantine_repair',
				'proposals_db_tombstones',
				'proposals_db_resurrect',
				'proposals_search',
				'proposals_compile_context',
				'proposals_summary_backfill',
			],
			['work', 'orchestrate'],
			['resource:proposal-templates'],
			['multi-agent-loop', 'proposals-workflow'],
			[],
			[],
			{
				summary:
					'Proposals workflow + multi-agent (swarm) orchestration.',
				tags: ['proposals', 'swarm', 'orchestration'],
				startupActivation: true,
				startupCheck: true,
				toolDisclosure: {
					agent_lock: 'contextual',
					agents_lock_diagnose: 'administrative',
					agent_worktree: 'contextual',
					branch_status: 'contextual',
					branch_gc: 'administrative',
					swarm_hygiene: 'contextual',
					task_queue: 'contextual',
					sync_proposals: 'contextual',
					proposal_get: 'contextual',
					round_context: 'contextual',
					agent_names: 'contextual',
					plan: 'contextual',
					delegate: 'contextual',
					proposal_transition: 'contextual',
					proposals_close_plan: 'contextual',
					create_proposal: 'contextual',
					close_slice: 'contextual',
					proposal_review: 'contextual',
					review_queue: 'contextual',
					review_claim: 'contextual',
					proposal_board: 'contextual',
					proposal_adopt: 'contextual',
					inherit_host_instructions: 'administrative',
					incident_proposals: 'contextual',
					auto_fix_queue: 'administrative',
					state_health: 'administrative',
					state_repair: 'administrative',
					proposal_stale_list: 'administrative',
					agent_lock_release_orphan: 'administrative',
					proposal_force_transition: 'administrative',
					proposal_reconcile_folder: 'administrative',
					proposal_diagnose: 'administrative',
					proposals_db_status: 'administrative',
					proposals_db_doctor: 'administrative',
					proposals_db_reconcile: 'administrative',
					proposals_db_rebuild: 'administrative',
					proposals_db_verify: 'administrative',
					proposals_db_diff: 'administrative',
					proposals_conflicts: 'administrative',
					proposals_db_quarantine_list: 'administrative',
					proposals_db_quarantine_repair: 'administrative',
					proposals_db_tombstones: 'administrative',
					proposals_db_resurrect: 'administrative',
					proposals_search: 'administrative',
					proposals_compile_context: 'contextual',
					proposals_summary_backfill: 'administrative',
				},
				toolSummaries: {
					agent_lock:
						'Claim files before editing, heartbeat while working, release after (claim/heartbeat/release/status/gc). The write-ownership primitive.',
					agents_lock_diagnose:
						'Diagnose stuck agents by correlating stale lock heartbeats, orphaned lock tmp files and the last matching log entry.',
					agent_worktree:
						"Not used under this project's development profile: agents share the checkout. Refuses create and says how to work instead.",
					branch_status:
						'Snapshot every work-ref, publication and agent branch and every worktree: ahead/behind vs base, dirty/untracked counts, out-of-cache flag.',
					branch_gc:
						'Remove worktrees whose branch is merged into base, clean, and idle (dry-run default; unmerged branches are sacred).',
					swarm_hygiene:
						'Read-only snapshot: rescue candidates (ahead + not merged), GC-eligible orphans, and out-of-cache worktrees.',
					task_queue:
						'Multi-agent coordination queue: enqueue/dequeue/subscribe/report (waitFor, observe, backpressure).',
					sync_proposals:
						'Rebuild the proposal index from the .md files (run after creating/renaming proposals).',
					get_proposal_workflow:
						'Read proposal workflow conventions and template.',
					proposal_get: 'Read a proposal or list them with filters.',
					round_context:
						'Persisted multi-agent round digest for resumed swarm work.',
					agent_names:
						'Name the whole agent tree (orchestrator included): assign/release/heartbeat/list/tree/who_uses/gc/reconcile.',
					continue_proposal:
						'Next proposal by cascade (mode auto), or a parallel slice plan/claim (modes plan/claim).',
					auto_work:
						'One call → next proposal + a compact ordered action plan (claim → slice → validate → sync → [persist] → release).',
					plan: 'Validate a set of work slices: file disjointness + which are claimable now (parallel plan).',
					delegate:
						'Hand a slice to a subagent: assign a name + claim its files, returning a handoff packet.',
					proposal_transition:
						'Move a proposal to a new status; validated, folder+frontmatter kept in sync.',
					proposals_close_plan:
						'Close a `type: plan` proposal. Refuses with a list of blockers until every child proposal, sub-plan, and own slice is done + peer-reviewed.',
					create_proposal:
						'Author a proposal (.md with frontmatter + disjoint ## Slices), validate overlap, write + sync index.',
					close_slice:
						'Mark a slice done in its proposal + release its agent lock, then re-sync.',
					proposal_review:
						'Peer-review a slice: submit for review, approve, or request changes — until a reviewer has no objection.',
					review_queue:
						'The proposals waiting in review, oldest first, with what each slice needs from a reviewer.',
					review_claim:
						'Take a proposal to review, in your review unit, before reading it.',
					proposal_board:
						'Orchestrator view: actionable proposals × slices (status/owner) + claimable now.',
					proposal_adopt:
						'Analyze an existing proposals folder — and with apply:true, bootstrap the canonical store (folders + README + index).',
					inherit_host_instructions:
						'Audit host-instruction files (in-repo + opt-in ~/ config) into a ready proposal.',
					incident_proposals:
						'Convert clustered redacted incidents into deduplicated local proposal drafts, and optionally write them.',
					auto_fix_queue:
						'Queue reproducible low/medium incident drafts for auto-fix, and optionally write proposal documents through the existing authoring path.',
					state_health:
						'Read-only swarm health: active locks, stale locks, livelocks, queue backpressure (waiterOrphans/threshold) and orphan assignments.',
					state_repair:
						'Heal stale swarm state: GC stale locks, expire due queue entries, force-release orphan assignments. dry-run by default.',
					compact_status:
						'One-call low-token snapshot of the swarm: active locks, queue backpressure and proposal board counts.',
					proposals_db_doctor:
						'Read-only diagnostics for the proposals SQLite database.',
					proposals_search:
						'Search proposals, plans, and slices with SQLite FTS5.',
					proposals_compile_context:
						'Compile minimal token-budgeted proposal context.',
				},
			},
		),
		tools(
			'quality',
			'@delendai/quality',
			[
				'complexity',
				'coverage',
				'get_quality_scopes',
				'run_quality',
				'quality_cancel',
				'quality_run_all',
			],
			[],
			[],
			['quality-gates'],
			[],
			[],
			{
				summary:
					'Quality gates: coverage, complexity, lint, type-check orchestration.',
				tags: ['quality', 'gates'],
				toolSummaries: {
					complexity:
						'Approximate cyclomatic hotspots in src/**/*.ts(x).',
					coverage:
						'Summarise vitest coverage-final.json into compact metrics.',
					get_quality_scopes:
						'List the available quality scopes and their commands.',
					run_quality:
						'Run a quality scope or scan the most recent validate output for findings.',
					quality_cancel:
						'Abort running quality commands (by PID or all) instead of waiting for the timeout.',
					quality_run_all:
						'Run every configured quality scope and return one aggregated pass/fail report.',
				},
			},
		),
		tools(
			'quality-policy',
			'@delendai/quality-policy',
			['quality_policy', 'quality_policy_run_settlement'],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands.',
				tags: ['quality', 'policy', 'aggregation', 'f00167'],
				toolSummaries: {
					quality_policy:
						'Unify cheap tests, conventions, lint, types and coverage policy signals without executing heavy quality runners.',
					quality_policy_run_settlement:
						'Run the q00013 settlement phase: bounded `bun run validate` retries; on success returns the green head sha; on failure returns the failing-file list for the repair agent.',
				},
			},
		),
		tools(
			'refactor',
			'@delendai/refactor',
			[
				'refactor_references',
				'refactor_definition',
				'refactor_symbols',
				'refactor_codemod',
				'refactor_rename',
				'refactor_apply',
			],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Refactor primitives (symbols, definition, references, rename, codemod).',
				tags: ['refactor'],
				toolSummaries: {
					refactor_references:
						'AST references of a symbol across one file (or a tiny set).',
					refactor_definition:
						'AST definition of a symbol in one file.',
					refactor_symbols:
						'AST top-level exported symbols of a file.',
					refactor_codemod:
						'Rule-based codemod planner with dry-run unified diffs.',
					refactor_rename:
						'Scoped multi-file rename planner (AST-safe, dry-run-first).',
					refactor_apply:
						'Apply a rename diff (containment-checked, gate-re-run).',
				},
			},
		),
		tools(
			'remote-provider-core',
			'@delendai/remote-provider-core',
			[],
			[],
			[],
			['remote-provider-core-overview'],
			[],
			[],
			{
				summary:
					'Shared remote-provider foundation: validated config, injectable HTTP, normalized errors.',
				tags: ['remote', 'provider', 'github', 'gitlab'],
			},
		),
		tools(
			'roadmap',
			'@delendai/roadmap',
			[
				'roadmap_show',
				'roadmap_sync',
				'roadmap_readiness',
				'roadmap_delta',
				'roadmap_plan_init',
				'roadmap_plan_close',
				'roadmap_promotion',
			],
			[],
			[],
			[],
			[],
			[],
			{
				summary:
					'Versioned roadmap: what each target version promises, what is delivered, whether it can be promoted, and the bump its promises imply.',
				tags: ['roadmap', 'release', 'timeline'],
			},
		),
		tools(
			'rules',
			'@delendai/rules',
			['get_rules', 'check_rules', 'apply_rules'],
			['enforce_rules'],
			[],
			['applying-rules'],
			[],
			[],
			{
				summary:
					'Lint/type rules engine (frameworks, dogmas, presets).',
				tags: ['rules', 'lint'],
				toolSummaries: {
					get_rules:
						'Returns the rules map (per area: framework, configs+typecheck configs project-first), the mode, conventions, and language dogmas.',
					check_rules:
						'Returns, per area, the linter command and resolved configs to validate compliance.',
					apply_rules:
						'Returns a mode-aware plan to make code comply.',
				},
			},
		),
		tools(
			'search',
			'@delendai/search',
			['search', 'references', 'symbol'],
			[],
			[],
			['search-usage'],
			[],
			[],
			{
				summary: 'Code search (semantic + symbol + references).',
				tags: ['search', 'symbol', 'f00136'],
				toolSummaries: {
					search: 'Search workspace text files for a query (grep-like, low-token).',
					references:
						'Find identifier occurrences of a symbol in ts/tsx files.',
					symbol: 'Find exported declarations whose name exactly matches a symbol.',
				},
			},
		),
		tools(
			'security',
			'@delendai/security',
			[
				'security_secrets',
				'security_deps',
				'security_sast',
				'security_audit',
			],
			[],
			[],
			['security-usage'],
			[],
			[],
			{
				summary: 'Security audit (CVEs, SAST, secrets, env).',
				tags: ['security', 'audit'],
				toolSummaries: {
					security_secrets:
						'Scan source for leaked secrets (keys, tokens, private keys) — offline, normalized findings.',
					security_deps:
						'Scan dependencies for known CVEs via bun/npm/yarn audit, with optional OSV enrichment.',
					security_sast:
						'Scan source for SAST findings via semgrep or ast-grep rule packs, with a bounded regex fallback.',
					security_audit:
						'Run every scanner (secrets + dependency CVEs + licenses) and return one ranked backlog.',
				},
			},
		),
		tools(
			'skills-pack',
			'@delendai/skills-pack',
			[],
			[],
			[],
			['skills-pack-overview'],
			[
				'delendai-debugging-playbook',
				'delendai-performance-optimization',
				'delendai-pr-review-checklist',
				'delendai-security-hardening-checklist',
				'delendai-incident-response',
				'delendai-migrate-from-x',
			],
			[],
			{
				summary:
					'Curated skill pack (debugging, perf, pr-review, security, incident, migration).',
				tags: ['skills'],
			},
		),
		tools(
			'status-marker',
			'@delendai/status-marker',
			['close', 'validate', 'ping'],
			[],
			[],
			['status-marker-table', 'status-marker-states'],
			[],
			[],
			{
				summary: 'Status marker + closure canonical line.',
				tags: ['status-marker', 'closure'],
				toolSummaries: {
					close: 'Return the canonical close-marker line for the given state (+ optional reason).',
					validate:
						'Audit a response: does its last line match the canonical close marker?',
					ping: 'Health check for the status-marker plugin.',
				},
			},
		),
		tools(
			'tech-debt',
			'@delendai/tech-debt',
			['debt_scan'],
			[],
			[],
			['tech-debt-usage'],
			[],
			[],
			{
				summary: 'Tech-debt scanner (TODO/FIXME/HACK inventory).',
				tags: ['tech-debt'],
				toolSummaries: {
					debt_scan:
						'Find tech-debt markers (TODO/FIXME/HACK/XXX/BUG/DEPRECATED/NOTE) across the workspace, ranked by severity. Offline.',
				},
			},
		),
		tools(
			'test-convention',
			'@delendai/test-convention',
			['get_convention', 'suggest_spec_path', 'scan_drift'],
			[],
			[],
			[
				'test-convention-overview',
				'test-convention-runners',
				'test-convention-coverage',
			],
			[],
			[],
			{
				summary:
					'Test-file convention enforcement (spec path, mock style, forbidden patterns).',
				tags: ['tests', 'convention'],
				toolSummaries: {
					get_convention:
						'Return the canonical test convention for the workspace (structured + markdown).',
					suggest_spec_path:
						'Given a source file path, return the spec path the convention requires + a starter skeleton.',
					scan_drift:
						'Audit specs and sources for violations of the test convention; returns { ok, counts, violations, scannedFiles }.',
				},
			},
		),
		tools(
			'test-policy',
			'@delendai/test-policy',
			['get_test_policy', 'set_test_policy'],
			[],
			[],
			['test-policy'],
			[],
			[],
			{
				summary: 'Test policy mode (TDD, tests-after, free, none).',
				tags: ['tests', 'policy'],
				toolSummaries: {
					get_test_policy:
						'Return the active test-writing policy (tdd/tests-after/free/none) with its agent guidance.',
					set_test_policy:
						'Override the test-writing policy for this workspace (durable), or clear the override.',
				},
			},
		),
		tools(
			'usage-tracking',
			'@delendai/usage-tracking',
			['usage_report', 'usage_clear', 'session_hygiene'],
			[],
			[],
			['usage-tracking-usage'],
			[],
			[],
			{
				summary: 'Per-token/per-call usage tracking (spend, budget).',
				tags: ['usage', 'spend'],
				startupActivation: true,
				toolSummaries: {
					usage_report:
						'Report usage, cost and attributable token savings by provider, plugin, agent, extension or model.',
					usage_clear:
						'Clear the recorded usage log + summary (requires confirmation).',
					session_hygiene:
						'Report local MCP session age, idle gaps and response-volume pressure.',
				},
			},
		),
		tools(
			'web-fetch',
			'@delendai/web-fetch',
			['web_fetch'],
			[],
			[],
			['web-usage'],
			[],
			[],
			{
				summary: 'Web fetch (allow-listed URLs only).',
				tags: ['web', 'fetch'],
				toolSummaries: {
					web_fetch:
						'Fetch one allow-listed URL and return capped text (opt-in, network).',
				},
			},
		),
	];
