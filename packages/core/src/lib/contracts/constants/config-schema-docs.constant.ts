/**
 * config-schema-docs.constant.ts — what every configuration value
 * MEANS, one sentence per legal value.
 *
 * The prose is a contract: it is what the editor shows on autocomplete
 * and what a model reads before it writes a config. It lives apart
 * from the shape because the shape changes when a field is added and
 * the meaning changes when a policy changes, and a reader looking up
 * "what does `granularity: slice` actually do" wants the second
 * without wading through the first.
 *
 * Every map is keyed by the values of the enum it documents, so adding
 * a value to an enum without writing its sentence is a compile error
 * rather than a gap somebody notices months later.
 */
import type { CAPABILITY_TAGS } from '../interfaces/provider-capabilities.interface';
import type { COMMIT_AUTHOR_MODES } from '../interfaces/commit-author.interface';
import type { MCP_TOOL_SURFACE_MODE } from '../interfaces/surface-mode.interface';
import type {
	BILLING_MODES,
	CREDENTIAL_MODES,
} from './provider-account-modes.constant';
import type { PERMISSION_CATEGORIES } from './permission-categories.constant';
import type { PUBLICATION_GRANULARITIES } from './publication-granularity.constant';
import type { STARTUP_REPORT_LEVEL_INPUTS } from '../../startup-report/level';
import type { PRESET_KIND } from '../../plugins/preset-catalog';
// Type-only on purpose: the agent kinds are needed for their NAMES here,
// not their value. Importing the value would make this module depend on
// the agent schema, which depends on `documentedEnum` — a cycle that
// cost a barrel import its evaluation order.
import type { DECLARED_AGENT_KINDS } from './declared-agent-schema.constant';

export const SURFACE_MODE_DOCS: Readonly<
	Record<(typeof MCP_TOOL_SURFACE_MODE)[number], string>
> = {
	native: 'Every tool is listed up front, with its full schema. Maximum discoverability, maximum context cost. Choose it when the host can afford the tokens or the tool count is small.',
	managed:
		'Only a small bootstrap surface is listed; the rest of the catalogue stays server-side and is reached through the router. The default balance between discoverability and context.',
	adaptive:
		'The listed surface grows and shrinks with the session: tools appear when the work needs them and are dropped when it does not. Costs the server some bookkeeping; buys back context.',
	compact:
		'The smallest listed surface. The model reaches every tool through the router by naming a domain and an action. The most context-efficient and the least discoverable.',
};

/** How verbose the startup report is. */
export const STARTUP_REPORT_LEVEL_DOCS: Readonly<
	Record<(typeof STARTUP_REPORT_LEVEL_INPUTS)[number], string>
> = {
	off: 'Print nothing. The quietest option; the report is suppressed entirely.',
	compact:
		'One line per plugin, with its load state and cost. Enough to see what came up, not enough to read.',
	medium: 'The default. The plugin table, the token accounting and the warnings, without the per-tool breakdown.',
	high: 'Adds the per-tool breakdown and the token-cost table.',
	full: 'Everything: per-tool schemas, the full cost table and the raw numbers behind each figure.',
	extended:
		'A legacy alias of `high`, kept so older configurations keep working. Prefer naming `high` explicitly.',
};

/** Whether the startup report is coloured. */
export const STARTUP_REPORT_COLOR_DOCS = {
	auto: 'Colour when the output is a terminal, plain text when it is piped or redirected. The usual choice.',
	always: 'Always emit colour codes, even when redirected. Use it when a downstream tool expects them.',
	never: 'Never emit colour codes. Use it when the output is parsed by something that does not understand them.',
} as const;

/** When the managed surface loads its plugins. */
export const MANAGED_SURFACE_LOADING_DOCS = {
	lazy: 'Load a plugin the first time a tool of its own is called. Keeps startup fast and the footprint small; the cost is a delay on the first call.',
	eager: 'Load every configured plugin at startup. Slower startup and a bigger footprint, but no first-call delay and no surprise latency later.',
} as const;

/** When cached evidence is swept. */
export const EVIDENCE_CLEANUP_DOCS = {
	'on-boot':
		'Sweep expired evidence while the server starts. The default: the cache does not grow without bound.',
	'dry-run':
		'Report what a sweep would remove, and remove nothing. Use it to size the sweep before letting it run.',
	off: 'Never sweep. Evidence accumulates until you delete it by hand.',
} as const;

/** Who is credited as the author of a commit. */
export const COMMIT_AUTHOR_MODE_DOCS: Readonly<
	Record<(typeof COMMIT_AUTHOR_MODES)[number], string>
> = {
	git: 'Use the identity git already has (user.name / user.email). The default, and the right choice unless the project says otherwise.',
	agent: 'Credit the agent that produced the work, as `agent <name>`. Use it when the commit should name the assistant.',
	bot: 'Credit a fixed bot identity. Use it in CI, where no human is responsible for the commit.',
	named: 'Credit the identity named by `commitAuthor.humanName` / `humanEmail`. Use it when a person stands behind the agent’s work.',
};

/** Where a plugin came from. */
export const PLUGIN_ORIGIN_DOCS = {
	bundled: 'Shipped with the host. The default for a first-party plugin.',
	'user-local':
		'Installed for one person, outside the project. Not shared with the team.',
	external:
		'A third-party plugin. Its code runs with the same authority as a first-party one — review it before you trust it.',
} as const;

/** When the cache is swept. */
export const CACHE_RUN_ON_BOOT_DOCS = {
	'dry-run': 'Report what the sweep would remove, and remove nothing.',
	apply: 'Remove what the sweep finds, using the owners’ own rules. The default.',
	off: 'Do not sweep the cache at boot.',
} as const;

/** What the server does about the git hooks that enforce the policy. */
export const GUARD_HOOKS_DOCS = {
	install:
		'Install or update the hooks on start. The default: the policy is enforced, not merely described.',
	report: 'Report whether the hooks are installed and current, and change nothing.',
	off: 'Leave the repository alone. The policy is then advice the agent follows, not a rule the hook refuses.',
} as const;

/** Who the git guard assumes an unidentified writer to be. */
export const GUARD_UNKNOWN_ACTOR_DOCS = {
	agent: 'Treat every unidentified writer as an agent, and hold it to the workflow. The default for a shared checkout, where the writers are agents.',
	person: 'Leave an unidentified writer free. Use it in a repository where humans and agents share the branch.',
} as const;

/** Whether the work refs are visible in the ordinary ref list. */
export const WORK_REFS_VISIBILITY_DOCS = {
	visible:
		'The work refs appear in `git branch` and the ordinary ref list. Use it when people should see the work in progress.',
	hidden: 'The work refs are kept out of the ordinary ref list. Use it when the refs are an implementation detail.',
} as const;

/** How much work one publication carries. */
export const PUBLICATION_GRANULARITY_DOCS: Readonly<
	Record<(typeof PUBLICATION_GRANULARITIES)[number], string>
> = {
	slice: 'One publication per slice. Every completed slice is published on its own — the most frequent, and the most review overhead.',
	proposal:
		'One publication per proposal, once all of its slices are done. The least frequent, and the largest review.',
	adaptive:
		'One publication per proposal when it is small, and slice by slice when it is not, judged by `publication.adaptive.maxSlices` and `maxChangedLines`. The default.',
};

/** Whether a model id the agent declared about itself is believed. */
export const IDENTITY_UNVERIFIED_CLAIMS_DOCS = {
	accept: 'Believe a model id the agent declared about itself when nothing observed it. Convenient, and it can be wrong.',
	refuse: 'Refuse to attribute work to a model that declared itself and was not observed. The default: an attribution is evidence, not a claim.',
} as const;

/** How the orchestrator reaches a provider. */
export const PROVIDER_KIND_DOCS = {
	api: 'A hosted HTTP API. The credential is an API key the project holds.',
	subscription:
		'A subscription login the provider’s own client holds. The credential is a session, not a key.',
	cli: 'A command line client the runner starts. The credential is whatever that client already has.',
	'mcp-server': 'An MCP server the runner calls as a tool.',
	acp: 'An agent reached over the Agent Client Protocol.',
	'host-sampling':
		'The model the host editor runs, through MCP sampling. The key stays with the host.',
} as const;

/** Which API dialect a provider speaks. */
export const INVOKE_API_FAMILY_DOCS = {
	openai: 'The OpenAI request/response shape. The `url` is the provider’s base URL.',
	anthropic:
		'The Anthropic messages shape. The `url` is the provider’s base URL.',
	google: 'The Google Generative Language shape. The `url` is the provider’s base URL.',
} as const;

/** The HTTP method an API provider is called with. */
export const INVOKE_API_METHOD_DOCS = {
	GET: 'A read. Used by the handful of endpoints that answer with a plain fetch.',
	POST: 'The default. Every request that carries a body — a chat completion, a generation — is a POST.',
} as const;

/** Who holds an account’s credential. */
export const CREDENTIAL_MODE_DOCS: Readonly<
	Record<(typeof CREDENTIAL_MODES)[number], string>
> = {
	'official-subscription-login':
		'The person logged in to the provider’s own client. The credential is that session.',
	'provider-plan-token': 'A token from a plan bought from the provider.',
	'byok-api-key':
		'An API key the person brought. The key lives in an environment variable; this file only names the variable.',
	'host-held':
		'The person’s key, held by the editor (Copilot BYOK). Delendai never sees it and never sends it anywhere.',
	'local-none':
		'No credential at all: the provider runs locally, on this machine.',
};

/** How an account’s use is paid for. */
export const BILLING_MODE_DOCS: Readonly<
	Record<(typeof BILLING_MODES)[number], string>
> = {
	'subscription-included':
		'Covered by a subscription the person already pays for.',
	'prepaid-token-plan': 'Drawn from a prepaid token plan.',
	'pay-as-you-go': 'Billed per call, against the provider’s own pricing.',
	local: 'Free to run: the compute is this machine’s.',
};

/** The window a budget is measured over. */
export const BUDGET_WINDOW_DOCS = {
	hourly: 'Requests allowed per hour.',
	weekly: 'Requests allowed per week.',
	monthly: 'Requests allowed per month.',
} as const;

/** How a declared agent is reached. */
export const DECLARED_AGENT_KIND_DOCS: Readonly<
	Record<(typeof DECLARED_AGENT_KINDS)[number], string>
> = {
	acp: 'An agent that speaks the Agent Client Protocol, described the way the ACP registry describes it.',
	cli: 'A command line agent. The runner starts it and probes it for its state.',
	exec: 'An executable the runner invokes directly.',
	http: 'An agent that answers over HTTP.',
	file: 'A file the runner reads.',
	mcp: 'An agent served by an MCP server.',
};

/** Where a registry entry came from. */
export const PLUGIN_REGISTRY_ORIGIN_DOCS = {
	'first-party':
		'Shipped by the project. Trusted by default and covered by its guarantees.',
	community:
		'Published by somebody else. Review it before you install it: it runs with your authority.',
} as const;

/** The preset a registry entry belongs to. */
export const PLUGIN_REGISTRY_DEFAULT_PRESET_DOCS: Readonly<
	Record<(typeof PRESET_KIND)[number] | 'vertex', string>
> = {
	minimal:
		'The smallest preset: the plugins a project needs to read and edit code, and nothing else.',
	lean: 'A small preset: `minimal` plus the plugins that keep a repository healthy.',
	standard: 'The default preset: the plugins most projects want on day one.',
	swarm: 'The preset for a multi-agent project: `standard` plus the plugins that coordinate agents.',
	full: 'Every plugin the project ships.',
	dogfood:
		'The preset this project uses on itself: everything, tuned for working on delendai.',
	'web-app':
		'A stack pack for a web application. Independent of the presets above: it resolves to its own plugin set.',
	'backend-api':
		'A stack pack for a backend service. Independent of the presets above.',
	'cli-tool':
		'A stack pack for a command line tool. Independent of the presets above.',
	vertex: 'A legacy brand alias that resolves to `dogfood`. Kept so older configurations keep working.',
};

/** What a plugin may do, grouped by the resource it touches. */
export const PERMISSION_CATEGORY_DOCS: Readonly<
	Record<(typeof PERMISSION_CATEGORIES)[number], string>
> = {
	'filesystem-read': 'Reading files outside the workspace.',
	'filesystem-write': 'Writing or deleting files.',
	process: 'Running commands and processes.',
	network: 'Reaching the network.',
	'git-read': 'Reading the repository’s history and state.',
	'git-write': 'Committing, branching, pushing.',
	'forge-read': 'Reading pull requests, reviews and the forge’s state.',
	'forge-write':
		'Opening pull requests and reviews, and pushing to the forge.',
	'env-read':
		'Reading environment variables — which is how secrets are usually found.',
	secrets: 'Handling credentials and other sensitive values.',
	browser: 'Driving a browser.',
	container: 'Running containers.',
	database: 'Reading or writing a database.',
};

/** What a provider is good at. */
export const CAPABILITY_TAG_DOCS: Readonly<
	Record<(typeof CAPABILITY_TAGS)[number], string>
> = {
	'code-edit': 'Applying edits to a codebase accurately.',
	'long-context': 'Holds a large context without losing the thread.',
	'very-long-context':
		'Holds a very large context; the right pick for whole-repository work.',
	architecture: 'Reasons about system structure and trade-offs.',
	'security-audit': 'Spots security-relevant defects.',
	reasoning: 'Reasons carefully about a hard problem.',
	vision: 'Understands images.',
	'fast-iteration': 'Answers quickly, for tight edit loops.',
	'json-strict': 'Emits JSON that parses without repair.',
	multilingual: 'Works across languages.',
	agentic: 'Drives a long multi-step task on its own.',
	summarization: 'Condenses long material faithfully.',
};
