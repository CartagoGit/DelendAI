/**
 * catalog-data.ts — the seed catalog, pure data (f00068 S1).
 *
 * Two on-disk tiers (gate decisions 1 + 2):
 *
 * - **curated** (10 entries): the resolved high-signal set — the user's
 *   stack plus the universal servers. NOT in the system prompt; one
 *   `external_mcp_catalog` call away, ~15 tokens per compact row.
 * - **discoverable** (30 representative entries across the proposal's
 *   categories): loaded on demand via `catalog { query }`, never
 *   returned whole (max 10 matches per call).
 *
 * Every entry is compact by design: `summary` is ONE line ≤ 80 chars,
 * `envVars` lists variable NAMES only (never values), `install` carries
 * a pinned example (`pinExample`) because unpinned `npx -y pkg@latest`
 * is a supply-chain hole. Pure module: no I/O, no core imports.
 */

export const CATALOG_CATEGORIES = [
	'filesystem',
	'vcs',
	'code-hosting',
	'web',
	'memory',
	'database',
	'search',
	'browser',
	'devops',
	'cloud',
	'framework',
	'language',
	'docs',
	'observability',
	'communication',
	'productivity',
	'security',
	'utility',
] as const;

export type ICatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export type ICatalogTier = 'curated' | 'discoverable';

export interface ICatalogInstall {
	/** Executable that boots the server (`npx`, `uvx`, `docker`, …). */
	readonly command: string;
	/** Argument template; `<…>` placeholders are user-supplied. */
	readonly args: readonly string[];
	/** A concrete pinned spec (never `latest`) the user can copy. */
	readonly pinExample: string;
}

export interface ICatalogEntry {
	/** Kebab-case id — the roster key and the `ext.<id>` namespace root. */
	readonly id: string;
	readonly tier: ICatalogTier;
	readonly category: ICatalogCategory;
	/** ONE line, ≤ 80 chars (compactness is a spec'd invariant). */
	readonly summary: string;
	readonly install: ICatalogInstall;
	/** Environment variable NAMES the server needs (never values). */
	readonly envVars?: readonly string[];
}

/** ⭐ Curated tier — the 10 resolved entries (gate decision 1). */
export const CURATED_CATALOG: readonly ICatalogEntry[] = [
	{
		id: 'filesystem',
		tier: 'curated',
		category: 'filesystem',
		summary:
			'Official filesystem server: read, write and search files in allowed roots.',
		install: {
			command: 'npx',
			args: [
				'-y',
				'@modelcontextprotocol/server-filesystem@2025.3.28',
				'<allowed-dir>',
			],
			pinExample: '@modelcontextprotocol/server-filesystem@2025.3.28',
		},
	},
	{
		id: 'git',
		tier: 'curated',
		category: 'vcs',
		summary:
			'Official git server: status, diff, log, branch and commit on local repos.',
		install: {
			command: 'uvx',
			args: ['mcp-server-git==0.6.2', '--repository', '<repo>'],
			pinExample: 'mcp-server-git==0.6.2',
		},
	},
	{
		id: 'github',
		tier: 'curated',
		category: 'code-hosting',
		summary:
			'Official GitHub server: issues, PRs, code search and Actions via the API.',
		install: {
			command: 'docker',
			args: [
				'run',
				'-i',
				'--rm',
				'-e',
				'GITHUB_PERSONAL_ACCESS_TOKEN',
				'ghcr.io/github/github-mcp-server:v0.9.1',
			],
			pinExample: 'ghcr.io/github/github-mcp-server:v0.9.1',
		},
		envVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
	},
	{
		id: 'fetch',
		tier: 'curated',
		category: 'web',
		summary:
			'Official fetch server: retrieve a URL and convert it to LLM-ready markdown.',
		install: {
			command: 'uvx',
			args: ['mcp-server-fetch==2025.4.7'],
			pinExample: 'mcp-server-fetch==2025.4.7',
		},
	},
	{
		id: 'memory',
		tier: 'curated',
		category: 'memory',
		summary:
			'Official knowledge-graph memory: persist entities and relations across chats.',
		install: {
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-memory@2025.4.25'],
			pinExample: '@modelcontextprotocol/server-memory@2025.4.25',
		},
	},
	{
		id: 'sqlite',
		tier: 'curated',
		category: 'database',
		summary:
			'Official SQLite server: run queries and inspect schema on a local DB file.',
		install: {
			command: 'uvx',
			args: ['mcp-server-sqlite==0.6.2', '--db-path', '<db-file>'],
			pinExample: 'mcp-server-sqlite==0.6.2',
		},
	},
	{
		id: 'postgres',
		tier: 'curated',
		category: 'database',
		summary:
			'Official read-only PostgreSQL server: schema inspection plus SELECT queries.',
		install: {
			command: 'npx',
			args: [
				'-y',
				'@modelcontextprotocol/server-postgres@0.6.2',
				'<connection-url>',
			],
			pinExample: '@modelcontextprotocol/server-postgres@0.6.2',
		},
	},
	{
		id: 'playwright',
		tier: 'curated',
		category: 'browser',
		summary:
			'Microsoft Playwright automation: navigate, click, fill, extract, screenshot.',
		install: {
			command: 'npx',
			args: ['-y', '@playwright/mcp@0.0.32'],
			pinExample: '@playwright/mcp@0.0.32',
		},
	},
	{
		id: 'docker',
		tier: 'curated',
		category: 'devops',
		summary:
			'Manage Docker containers, images, volumes and compose stacks over stdio.',
		install: {
			command: 'uvx',
			args: ['mcp-server-docker==0.2.0'],
			pinExample: 'mcp-server-docker==0.2.0',
		},
	},
	{
		id: 'angular',
		tier: 'curated',
		category: 'framework',
		summary:
			'Official Angular CLI MCP (ng mcp): docs search, best practices, project info.',
		install: {
			command: 'npx',
			args: ['-y', '@angular/cli@20.0.4', 'mcp'],
			pinExample: '@angular/cli@20.0.4',
		},
	},
];

/** 🟡 Discoverable tier — representative breadth, loaded on demand. */
export const DISCOVERABLE_CATALOG: readonly ICatalogEntry[] = [
	{
		id: 'context7',
		tier: 'discoverable',
		category: 'docs',
		summary:
			'Version-pinned library docs for any framework; fixes hallucinated APIs.',
		install: {
			command: 'npx',
			args: ['-y', '@upstash/context7-mcp@1.0.14'],
			pinExample: '@upstash/context7-mcp@1.0.14',
		},
	},
	{
		id: 'language-server',
		tier: 'discoverable',
		category: 'language',
		summary:
			'Wraps any LSP (30+ languages): definitions, references, diagnostics.',
		install: {
			command: 'mcp-language-server',
			args: ['--workspace', '<dir>', '--lsp', '<lsp-command>'],
			pinExample: 'github.com/isaacphi/mcp-language-server@v0.1.1',
		},
	},
	{
		id: 'kubernetes',
		tier: 'discoverable',
		category: 'devops',
		summary:
			'Inspect and manage Kubernetes clusters: pods, deployments, services, logs.',
		install: {
			command: 'npx',
			args: ['-y', 'mcp-server-kubernetes@2.4.10'],
			pinExample: 'mcp-server-kubernetes@2.4.10',
		},
	},
	{
		id: 'redis',
		tier: 'discoverable',
		category: 'database',
		summary:
			'Official Redis server: keys, search, JSON, streams and pub/sub operations.',
		install: {
			command: 'uvx',
			args: ['mcp-redis==0.2.0'],
			pinExample: 'mcp-redis==0.2.0',
		},
		envVars: ['REDIS_URL'],
	},
	{
		id: 'mongodb',
		tier: 'discoverable',
		category: 'database',
		summary:
			'Official MongoDB server: query, aggregate and inspect collections or Atlas.',
		install: {
			command: 'npx',
			args: ['-y', 'mongodb-mcp-server@0.1.0'],
			pinExample: 'mongodb-mcp-server@0.1.0',
		},
		envVars: ['MDB_MCP_CONNECTION_STRING'],
	},
	{
		id: 'notion',
		tier: 'discoverable',
		category: 'productivity',
		summary:
			'Official Notion server: search, read and write pages and databases.',
		install: {
			command: 'npx',
			args: ['-y', '@notionhq/notion-mcp-server@1.8.1'],
			pinExample: '@notionhq/notion-mcp-server@1.8.1',
		},
		envVars: ['NOTION_TOKEN'],
	},
	{
		id: 'slack',
		tier: 'discoverable',
		category: 'communication',
		summary:
			'Slack workspace access: channels, messages, threads and user lookups.',
		install: {
			command: 'npx',
			args: ['-y', '@zencoderai/slack-mcp-server@1.0.0'],
			pinExample: '@zencoderai/slack-mcp-server@1.0.0',
		},
		envVars: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
	},
	{
		id: 'gitlab',
		tier: 'discoverable',
		category: 'code-hosting',
		summary: 'GitLab API: projects, issues, merge requests and pipelines.',
		install: {
			command: 'npx',
			args: ['-y', '@zereight/mcp-gitlab@1.0.48'],
			pinExample: '@zereight/mcp-gitlab@1.0.48',
		},
		envVars: ['GITLAB_PERSONAL_ACCESS_TOKEN'],
	},
	{
		id: 'chrome-devtools',
		tier: 'discoverable',
		category: 'browser',
		summary:
			'Chrome DevTools: performance traces, console, network and heap snapshots.',
		install: {
			command: 'npx',
			args: ['-y', 'chrome-devtools-mcp@0.4.0'],
			pinExample: 'chrome-devtools-mcp@0.4.0',
		},
	},
	{
		id: 'elasticsearch',
		tier: 'discoverable',
		category: 'search',
		summary:
			'Official Elasticsearch server: search indices, mappings and aggregations.',
		install: {
			command: 'npx',
			args: ['-y', '@elastic/mcp-server-elasticsearch@0.1.1'],
			pinExample: '@elastic/mcp-server-elasticsearch@0.1.1',
		},
		envVars: ['ES_URL', 'ES_API_KEY'],
	},
	{
		id: 'mysql',
		tier: 'discoverable',
		category: 'database',
		summary: 'MySQL server: schema inspection and parameterised queries.',
		install: {
			command: 'npx',
			args: ['-y', '@benborla29/mcp-server-mysql@2.0.2'],
			pinExample: '@benborla29/mcp-server-mysql@2.0.2',
		},
		envVars: ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASS'],
	},
	{
		id: 'supabase',
		tier: 'discoverable',
		category: 'database',
		summary:
			'Official Supabase server: database, auth, storage and edge functions.',
		install: {
			command: 'npx',
			args: ['-y', '@supabase/mcp-server-supabase@0.4.5'],
			pinExample: '@supabase/mcp-server-supabase@0.4.5',
		},
		envVars: ['SUPABASE_ACCESS_TOKEN'],
	},
	{
		id: 'neon',
		tier: 'discoverable',
		category: 'database',
		summary:
			'Official Neon serverless Postgres: branches, databases and SQL.',
		install: {
			command: 'npx',
			args: ['-y', '@neondatabase/mcp-server-neon@0.4.0'],
			pinExample: '@neondatabase/mcp-server-neon@0.4.0',
		},
		envVars: ['NEON_API_KEY'],
	},
	{
		id: 'qdrant',
		tier: 'discoverable',
		category: 'database',
		summary:
			'Qdrant vector store: semantic memory, collections and similarity search.',
		install: {
			command: 'uvx',
			args: ['mcp-server-qdrant==0.7.1'],
			pinExample: 'mcp-server-qdrant==0.7.1',
		},
		envVars: ['QDRANT_URL', 'QDRANT_API_KEY'],
	},
	{
		id: 'grafana',
		tier: 'discoverable',
		category: 'observability',
		summary:
			'Official Grafana server: dashboards, datasources, incidents and alerts.',
		install: {
			command: 'docker',
			args: ['run', '-i', '--rm', 'mcp/grafana:0.4.0'],
			pinExample: 'mcp/grafana:0.4.0',
		},
		envVars: ['GRAFANA_URL', 'GRAFANA_API_KEY'],
	},
	{
		id: 'prometheus',
		tier: 'discoverable',
		category: 'observability',
		summary:
			'Query Prometheus: instant and range queries, metric metadata, targets.',
		install: {
			command: 'uvx',
			args: ['prometheus-mcp-server==1.1.0'],
			pinExample: 'prometheus-mcp-server==1.1.0',
		},
		envVars: ['PROMETHEUS_URL'],
	},
	{
		id: 'sentry',
		tier: 'discoverable',
		category: 'observability',
		summary:
			'Sentry issues and events: inspect errors and analyse stack traces.',
		install: {
			command: 'uvx',
			args: ['mcp-server-sentry==0.6.2'],
			pinExample: 'mcp-server-sentry==0.6.2',
		},
		envVars: ['SENTRY_AUTH_TOKEN'],
	},
	{
		id: 'terraform',
		tier: 'discoverable',
		category: 'devops',
		summary:
			'Official HashiCorp Terraform: registry providers, modules and plan review.',
		install: {
			command: 'docker',
			args: ['run', '-i', '--rm', 'hashicorp/terraform-mcp-server:0.1.0'],
			pinExample: 'hashicorp/terraform-mcp-server:0.1.0',
		},
	},
	{
		id: 'pulumi',
		tier: 'discoverable',
		category: 'devops',
		summary:
			'Official Pulumi server: registry resources, stack state and deployments.',
		install: {
			command: 'npx',
			args: ['-y', '@pulumi/mcp-server@0.1.2'],
			pinExample: '@pulumi/mcp-server@0.1.2',
		},
	},
	{
		id: 'cloudflare',
		tier: 'discoverable',
		category: 'cloud',
		summary:
			'Official Cloudflare server: Workers, KV, R2, D1 and DNS management.',
		install: {
			command: 'npx',
			args: ['-y', '@cloudflare/mcp-server-cloudflare@2.0.2'],
			pinExample: '@cloudflare/mcp-server-cloudflare@2.0.2',
		},
		envVars: ['CLOUDFLARE_API_TOKEN'],
	},
	{
		id: 'aws',
		tier: 'discoverable',
		category: 'cloud',
		summary:
			'AWS Labs suite: S3, Lambda, DynamoDB, CloudWatch and more per sub-server.',
		install: {
			command: 'uvx',
			args: ['awslabs.core-mcp-server==0.1.2'],
			pinExample: 'awslabs.core-mcp-server==0.1.2',
		},
		envVars: ['AWS_PROFILE', 'AWS_REGION'],
	},
	{
		id: 'jira',
		tier: 'discoverable',
		category: 'productivity',
		summary:
			'Jira Cloud: search, read and transition issues with JQL support.',
		install: {
			command: 'npx',
			args: ['-y', '@aashari/mcp-server-atlassian-jira@1.24.1'],
			pinExample: '@aashari/mcp-server-atlassian-jira@1.24.1',
		},
		envVars: [
			'ATLASSIAN_API_TOKEN',
			'ATLASSIAN_SITE_NAME',
			'ATLASSIAN_USER_EMAIL',
		],
	},
	{
		id: 'confluence',
		tier: 'discoverable',
		category: 'productivity',
		summary: 'Confluence Cloud: spaces, pages and CQL search.',
		install: {
			command: 'npx',
			args: ['-y', '@aashari/mcp-server-atlassian-confluence@1.20.1'],
			pinExample: '@aashari/mcp-server-atlassian-confluence@1.20.1',
		},
		envVars: ['ATLASSIAN_API_TOKEN'],
	},
	{
		id: 'linear',
		tier: 'discoverable',
		category: 'productivity',
		summary:
			'Linear issue tracking: issues, projects, cycles and comments.',
		install: {
			command: 'npx',
			args: ['-y', 'mcp-linear@0.1.9'],
			pinExample: 'mcp-linear@0.1.9',
		},
		envVars: ['LINEAR_API_KEY'],
	},
	{
		id: 'storybook',
		tier: 'discoverable',
		category: 'framework',
		summary:
			'Storybook addon: generate and test component stories from the dev server.',
		install: {
			command: 'npx',
			args: ['-y', '@storybook/addon-mcp@0.2.0'],
			pinExample: '@storybook/addon-mcp@0.2.0',
		},
	},
	{
		id: 'tailwind',
		tier: 'discoverable',
		category: 'framework',
		summary: 'Tailwind CSS utility reference and class suggestions.',
		install: {
			command: 'npx',
			args: ['-y', 'tailwind-mcp@0.3.1'],
			pinExample: 'tailwind-mcp@0.3.1',
		},
	},
	{
		id: 'snyk',
		tier: 'discoverable',
		category: 'security',
		summary: 'Snyk scans: dependency, code and container vulnerabilities.',
		install: {
			command: 'npx',
			args: ['-y', 'snyk@1.1298.0', 'mcp'],
			pinExample: 'snyk@1.1298.0',
		},
		envVars: ['SNYK_TOKEN'],
	},
	{
		id: 'semgrep',
		tier: 'discoverable',
		category: 'security',
		summary:
			'Semgrep static analysis: scan code for bugs and security findings.',
		install: {
			command: 'uvx',
			args: ['semgrep-mcp==0.4.0'],
			pinExample: 'semgrep-mcp==0.4.0',
		},
	},
	{
		id: 'vault',
		tier: 'discoverable',
		category: 'security',
		summary:
			'HashiCorp Vault: secret engines, policies and token management.',
		install: {
			command: 'uvx',
			args: ['mcp-vault==0.2.1'],
			pinExample: 'mcp-vault==0.2.1',
		},
		envVars: ['VAULT_ADDR', 'VAULT_TOKEN'],
	},
	{
		id: 'time',
		tier: 'discoverable',
		category: 'utility',
		summary: 'Official time server: current time and timezone conversions.',
		install: {
			command: 'uvx',
			args: ['mcp-server-time==2025.4.8'],
			pinExample: 'mcp-server-time==2025.4.8',
		},
	},
];

/** Both tiers, curated first (stable order for deterministic slicing). */
export const FULL_CATALOG: readonly ICatalogEntry[] = [
	...CURATED_CATALOG,
	...DISCOVERABLE_CATALOG,
];
