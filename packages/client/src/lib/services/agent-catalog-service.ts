import type {
	ICatalogSnapshot,
	IProposalSummary,
	ISkillSummary,
	IToolSummary,
	McpVertexToolOutputs,
} from '@delendai/core/public';

import type { McpStdioClient } from '../transport/mcp-stdio-client';
import { formatToolName } from './_namespace';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const ACTIONABLE_PROPOSAL_STATUSES = new Set<IProposalSummary['status']>([
	'ready',
	'in-progress',
	'paused',
]);
const DEFAULT_AGENT_POLICY = {
	autonomous: true,
	principles: [
		'Apply SOLID architecture where it improves ownership and changeability.',
		'Use good engineering practices and keep the code clear and maintainable.',
		'Reuse existing code and abstractions before introducing duplication.',
		'Keep naming, files, and folders homogeneous with the surrounding project.',
	],
} as const;

/**
 * v00129 S1 (AUD-B01): `agent_catalog`'s WIRE-DECLARED `outputSchema` is
 * now a permissive `compactOutputSchema()` (see
 * `packages/core/src/lib/surface/compact-output-schema.ts`), so it can no
 * longer be derived from `McpVertexToolOutputs`. `ICatalogSnapshot` is the
 * hand-kept interface `agent-catalog-tool.ts`'s handler actually builds
 * its response from (`buildCatalog` + `applyQuery`/`applySection`) — it
 * describes what the server truly returns, which has not changed. `ok`/
 * `matches` are the envelope/optional fields `toolOk()` and the query
 * path add on top.
 */
type IAgentCatalogOutput = ICatalogSnapshot & {
	readonly ok?: boolean;
	readonly matches?: number;
};
type ISkillToolOutput = McpVertexToolOutputs['mcp-vertex_skill'];

export interface IAgentCatalogSearchResult {
	readonly tools: IToolSummary[];
	readonly skills: ISkillSummary[];
	readonly proposals: IProposalSummary[];
}

export interface IAgentCatalogServiceOptions {
	readonly ttlMs?: number;
	readonly now?: () => number;
	readonly namespacePrefix?: string;
}

interface ICatalogCacheEntry {
	readonly snapshot: ICatalogSnapshot;
	readonly fetchedAt: number;
}

interface IAgentBootstrapPromptResult {
	readonly messages: ReadonlyArray<{
		readonly content: {
			readonly type: 'text';
			readonly text: string;
		};
	}>;
}

const includesQuery = (fields: readonly string[], query: string): boolean => {
	const tokens = query
		.trim()
		.toLowerCase()
		.split(/\s+/u)
		.filter((token) => token.length > 0);
	if (tokens.length === 0) return true;
	const haystack = fields
		.map((field) => field.toLowerCase())
		.filter((field) => field.length > 0);
	return tokens.every((token) =>
		haystack.some((field) => field.includes(token)),
	);
};

const cloneTools = (tools: readonly IToolSummary[]): IToolSummary[] =>
	tools.map((tool) => ({
		name: tool.name,
		...(tool.plugin === undefined ? {} : { plugin: tool.plugin }),
		...(tool.summary === undefined ? {} : { summary: tool.summary }),
		...(tool.tags === undefined ? {} : { tags: [...tool.tags] }),
		...(tool.effects === undefined ? {} : { effects: [...tool.effects] }),
	}));

const cloneSkills = (skills: readonly ISkillSummary[]): ISkillSummary[] =>
	skills.map((skill) => ({
		id: skill.id,
		version: skill.version,
		minCoreVersion: skill.minCoreVersion,
		summary: skill.summary,
		appliesTo: [...skill.appliesTo],
		tags: [...skill.tags],
		bodyPath: skill.bodyPath,
	}));

const cloneProposals = (
	proposals: readonly IProposalSummary[],
): IProposalSummary[] => proposals.map((proposal) => ({ ...proposal }));

const filterTools = (
	tools: readonly IToolSummary[],
	query?: string,
): IToolSummary[] => {
	if (query === undefined || query.trim().length === 0)
		return cloneTools(tools);
	return cloneTools(
		tools.filter((tool) =>
			includesQuery(
				[
					tool.name,
					tool.plugin ?? '',
					tool.summary ?? '',
					...(tool.tags ?? []),
				],
				query,
			),
		),
	);
};

const filterSkills = (
	skills: readonly ISkillSummary[],
	query?: string,
): ISkillSummary[] => {
	if (query === undefined || query.trim().length === 0)
		return cloneSkills(skills);
	return cloneSkills(
		skills.filter((skill) =>
			includesQuery(
				[skill.id, skill.summary, ...skill.tags, ...skill.appliesTo],
				query,
			),
		),
	);
};

const filterProposals = (
	proposals: readonly IProposalSummary[],
	query?: string,
): IProposalSummary[] => {
	const actionable = proposals.filter((proposal) =>
		ACTIONABLE_PROPOSAL_STATUSES.has(proposal.status),
	);
	if (query === undefined || query.trim().length === 0) {
		return cloneProposals(actionable);
	}
	return cloneProposals(
		actionable.filter((proposal) =>
			includesQuery(
				[
					proposal.id,
					proposal.title,
					proposal.track,
					proposal.kind,
					proposal.status,
				],
				query,
			),
		),
	);
};

const promptTextOf = async (snapshot: ICatalogSnapshot): Promise<string> => {
	const actionable =
		snapshot.proposals.length === 0
			? 'none'
			: snapshot.proposals.map((proposal) => proposal.id).join(', ');
	const result: IAgentBootstrapPromptResult = {
		messages: [
			{
				content: {
					type: 'text',
					text: [
						`Working mode: ${DEFAULT_AGENT_POLICY.autonomous ? 'autonomous by default' : 'collaborative / ask before autonomous execution'}.`,
						'Engineering principles:',
						...DEFAULT_AGENT_POLICY.principles.map(
							(principle) => `- ${principle}`,
						),
						'1. Call `mcp-vertex_overview` first to map the server and confirm the loaded plugin surface.',
						'2. Call `mcp-vertex_agent_catalog` with `{ "mode": "compact" }` to discover the canonical tools, skills, and actionable proposals available right now.',
						'3. Narrow with `section` or `query` before doing work, then pick the matching proposal or skill instead of rereading docs broadly.',
						'4. To use a skill: call `mcp-vertex_skill` (no args) for the compact list of what each skill is and when to use it, then `mcp-vertex_skill { "id": "<skill-id>" }` to load that one skill body only when you are about to apply it (keeps token cost low).',
						`Actionable proposals: ${actionable}`,
					].join('\n'),
				},
			},
		],
	};
	return result.messages[0]?.content.text ?? '';
};

export class AgentCatalogService {
	private cache: ICatalogCacheEntry | undefined;
	private readonly ttlMs: number;
	private readonly now: () => number;
	private readonly namespacePrefix: string | undefined;

	constructor(
		private readonly client: McpStdioClient,
		options: IAgentCatalogServiceOptions = {},
	) {
		this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.now = options.now ?? (() => Date.now());
		this.namespacePrefix = options.namespacePrefix;
	}

	async getTools(query?: string): Promise<readonly IToolSummary[]> {
		const snapshot = await this.getSnapshot();
		return filterTools(snapshot.tools, query);
	}

	async getSkills(query?: string): Promise<readonly ISkillSummary[]> {
		const snapshot = await this.getSnapshot();
		return filterSkills(snapshot.skills, query);
	}

	async getProposals(query?: string): Promise<readonly IProposalSummary[]> {
		const snapshot = await this.getSnapshot();
		return filterProposals(snapshot.proposals, query);
	}

	async search(query: string): Promise<IAgentCatalogSearchResult> {
		const snapshot = await this.getSnapshot();
		return {
			tools: filterTools(snapshot.tools, query),
			skills: filterSkills(snapshot.skills, query),
			proposals: filterProposals(snapshot.proposals, query),
		};
	}

	invalidate(): void {
		this.cache = undefined;
	}

	async getBootstrapPrompt(): Promise<string> {
		return promptTextOf(await this.getSnapshot());
	}

	async getSkillBody(id: string): Promise<string> {
		const result = await this.client.request<
			{ id: string },
			ISkillToolOutput
		>(formatToolName(this.namespacePrefix, 'skill'), { id });
		if (typeof result.body !== 'string') {
			throw new Error(`Skill "${id}" did not return a body`);
		}
		return result.body;
	}

	private async getSnapshot(): Promise<ICatalogSnapshot> {
		if (
			this.cache !== undefined &&
			this.now() - this.cache.fetchedAt < this.ttlMs
		) {
			return this.cache.snapshot;
		}
		const result = await this.client.request<
			{ mode: 'full' },
			IAgentCatalogOutput
		>(formatToolName(this.namespacePrefix, 'agent_catalog'), {
			mode: 'full',
		});
		// The wire type marks skill detail fields optional because the
		// compact orientation projection omits them; mode:"full" always
		// carries them, so normalise with safe fallbacks for the strict
		// ICatalogSnapshot shape.
		const snapshot: ICatalogSnapshot = {
			...result,
			skills: result.skills.map((skill) => ({
				id: skill.id,
				version: skill.version ?? '0.0.0',
				minCoreVersion: skill.minCoreVersion ?? '0.0.0',
				summary: skill.summary ?? '',
				appliesTo: skill.appliesTo ?? [],
				tags: skill.tags,
				bodyPath: skill.bodyPath ?? '',
			})),
		};
		this.cache = {
			snapshot,
			fetchedAt: this.now(),
		};
		return snapshot;
	}
}
