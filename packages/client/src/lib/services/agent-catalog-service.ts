import {
	ACTIONABLE_PROPOSAL_STATUSES,
	buildAgentBootstrapPromptRegistration,
	type ICatalogSnapshot,
	type IProposalSummary,
	type ISkillSummary,
	type IToolSummary,
	type McpVertexToolOutputs,
} from '@mcp-vertex/core/public';

import type { McpStdioClient } from '../transport/mcp-stdio-client';

const AGENT_CATALOG_TOOL = 'mcp-vertex_agent_catalog';
const SKILL_TOOL = 'mcp-vertex_skill';
const DEFAULT_TTL_MS = 5 * 60 * 1000;

type IAgentCatalogOutput = McpVertexToolOutputs['mcp-vertex_agent_catalog'];
type ISkillToolOutput = McpVertexToolOutputs['mcp-vertex_skill'];

export interface IAgentCatalogSearchResult {
	readonly tools: IToolSummary[];
	readonly skills: ISkillSummary[];
	readonly proposals: IProposalSummary[];
}

export interface IAgentCatalogServiceOptions {
	readonly ttlMs?: number;
	readonly now?: () => number;
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
		plugin: tool.plugin,
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
					tool.plugin,
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
		ACTIONABLE_PROPOSAL_STATUSES.includes(proposal.status),
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
	let handler: (() => Promise<IAgentBootstrapPromptResult>) | undefined;
	const registration = buildAgentBootstrapPromptRegistration(
		snapshot.server.namespacePrefix,
		{
			sources: {
				tools: () => snapshot.tools,
				skills: () => snapshot.skills,
				proposals: () => snapshot.proposals,
			},
			server: snapshot.server,
		},
	);
	await registration.register({
		registerPrompt(_name: string, _meta: unknown, candidate: unknown) {
			handler = candidate as () => Promise<IAgentBootstrapPromptResult>;
		},
	} as unknown as Parameters<typeof registration.register>[0]);
	if (handler === undefined) {
		throw new Error('Agent bootstrap prompt handler was not registered');
	}
	const result = await handler();
	return result.messages[0]?.content.text ?? '';
};

export class AgentCatalogService {
	private cache: ICatalogCacheEntry | undefined;
	private readonly ttlMs: number;
	private readonly now: () => number;

	constructor(
		private readonly client: McpStdioClient,
		options: IAgentCatalogServiceOptions = {},
	) {
		this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.now = options.now ?? (() => Date.now());
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
		>(SKILL_TOOL, { id });
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
		const snapshot = await this.client.request<
			{ mode: 'full' },
			IAgentCatalogOutput
		>(AGENT_CATALOG_TOOL, { mode: 'full' });
		this.cache = {
			snapshot,
			fetchedAt: this.now(),
		};
		return snapshot;
	}
}
