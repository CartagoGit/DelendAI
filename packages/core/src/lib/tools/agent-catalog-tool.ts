import { z } from 'zod';

import { CAPABILITY_TAGS } from '../contracts/interfaces/provider-capabilities.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolOk } from '../shared/tool-response';
import { buildCatalog } from '../catalog/agent-discovery-catalog';
import type {
	CatalogSection,
	IBuildCatalogOptions,
	ICatalogSnapshot,
	ICatalogSources,
	IProposalSummary,
	ISkillSummary,
	IToolSummary,
} from '../catalog/agent-discovery-types';

export interface ICatalogToolOptions {
	readonly sources: ICatalogSources;
	readonly server: IBuildCatalogOptions['server'];
	readonly now?: () => Date;
}

const sectionEnum = z.enum(['tools', 'skills', 'proposals']);
const proposalStatusEnum = z.enum([
	'ready',
	'in-progress',
	'review',
	'paused',
	'done',
	'blocked',
	'retired',
	'unspecified',
]);
const proposalKindEnum = z.enum([
	'feat',
	'fix',
	'refactor',
	'chore',
	'docs',
	'plan',
	'audit',
	'unspecified',
]);

const toolSummarySchema = z.object({
	name: z.string(),
	plugin: z.string().optional(),
	summary: z.string().optional(),
	tags: z.array(z.string()).optional(),
	effects: z
		.array(z.enum(['write', 'spawn', 'network', 'destructive']))
		.optional(),
});

const skillSummarySchema = z.object({
	id: z.string(),
	version: z.string(),
	minCoreVersion: z.string(),
	summary: z.string(),
	appliesTo: z.array(z.string()),
	tags: z.array(z.string()),
	bodyPath: z.string(),
});

const proposalSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	track: z.string(),
	status: proposalStatusEnum,
	kind: proposalKindEnum,
	date: z.string().optional(),
});

// f00067a S2: lean projection of the config file's root `providers`
// roster. Mirrors IProviderSummary — `reachable` here is the boot-time
// conservative value; live availability is the orchestrator-runner's
// `healthcheck_providers` tool.
const providerSummarySchema = z.object({
	id: z.string(),
	kind: z.enum(['api', 'subscription', 'cli', 'mcp-server']),
	modelId: z.string(),
	// Literal union (not `.int().min(1).max(5)`) so the generated SDK type
	// stays assignable to the contract's `CostTier` (1|2|3|4|5).
	costTier: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(3),
		z.literal(4),
		z.literal(5),
	]),
	reachable: z.boolean(),
	strengths: z.array(z.enum(CAPABILITY_TAGS)),
});

const snapshotSchema = z.object({
	ok: z.boolean().optional(),
	matches: z.number().int().nonnegative().optional(),
	server: z.object({
		name: z.string(),
		version: z.string(),
		namespacePrefix: z.string(),
	}),
	generatedAt: z.string(),
	mode: z.enum(['compact', 'full']),
	counts: z.object({
		tools: z.number().int().nonnegative(),
		skills: z.number().int().nonnegative(),
		proposals: z.number().int().nonnegative(),
	}),
	proposalStatusCounts: z.object({
		ready: z.number().int().nonnegative(),
		'in-progress': z.number().int().nonnegative(),
		review: z.number().int().nonnegative(),
		paused: z.number().int().nonnegative(),
		done: z.number().int().nonnegative(),
		blocked: z.number().int().nonnegative(),
		retired: z.number().int().nonnegative(),
		unspecified: z.number().int().nonnegative(),
	}),
	tools: z.array(toolSummarySchema),
	skills: z.array(skillSummarySchema),
	proposals: z.array(proposalSummarySchema),
	// Present only when the workspace configures a provider roster.
	providers: z.array(providerSummarySchema).optional(),
});

const lowerIncludes = (haystack: string | undefined, needle: string): boolean =>
	haystack?.toLocaleLowerCase().includes(needle) ?? false;

const tagsInclude = (
	tags: readonly string[] | undefined,
	needle: string,
): boolean => (tags ?? []).some((tag) => lowerIncludes(tag, needle));

const matchesTool = (tool: IToolSummary, query: string): boolean =>
	lowerIncludes(tool.name, query) ||
	lowerIncludes(tool.plugin, query) ||
	lowerIncludes(tool.summary, query) ||
	tagsInclude(tool.tags, query);

const matchesSkill = (skill: ISkillSummary, query: string): boolean =>
	lowerIncludes(skill.id, query) ||
	lowerIncludes(skill.summary, query) ||
	tagsInclude(skill.tags, query) ||
	tagsInclude(skill.appliesTo, query);

const matchesProposal = (proposal: IProposalSummary, query: string): boolean =>
	lowerIncludes(proposal.id, query) ||
	lowerIncludes(proposal.title, query) ||
	lowerIncludes(proposal.track, query) ||
	lowerIncludes(proposal.kind, query) ||
	lowerIncludes(proposal.status, query);

const applySection = (
	snapshot: ICatalogSnapshot,
	section: CatalogSection | undefined,
): ICatalogSnapshot => {
	if (section === undefined) return snapshot;
	return {
		...snapshot,
		tools: section === 'tools' ? snapshot.tools : [],
		skills: section === 'skills' ? snapshot.skills : [],
		proposals: section === 'proposals' ? snapshot.proposals : [],
	};
};

const countMatches = (snapshot: ICatalogSnapshot): number =>
	snapshot.tools.length + snapshot.skills.length + snapshot.proposals.length;

const applyQuery = (
	snapshot: ICatalogSnapshot,
	query: string | undefined,
): { readonly snapshot: ICatalogSnapshot; readonly matches?: number } => {
	if (query === undefined || query.trim().length === 0) {
		return { snapshot };
	}
	const needle = query.trim().toLocaleLowerCase();
	const filtered: ICatalogSnapshot = {
		...snapshot,
		tools: snapshot.tools.filter((tool) => matchesTool(tool, needle)),
		skills: snapshot.skills.filter((skill) => matchesSkill(skill, needle)),
		proposals: snapshot.proposals.filter((proposal) =>
			matchesProposal(proposal, needle),
		),
	};
	return { snapshot: filtered, matches: countMatches(filtered) };
};

export const buildAgentCatalogToolRegistration = (
	namespacePrefix: string,
	options: ICatalogToolOptions,
): IToolRegistration => ({
	id: 'agent_catalog',
	summary:
		'Unified discovery catalog for loaded tools, versioned skills and actionable proposals. Read-only.',
	descriptionKey: 'mcp-vertex_agent_catalog',
	tags: ['orientation'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_agent_catalog`,
			{
				description:
					'Unified discovery catalog for this MCP server. Returns loaded tools, versioned skills and actionable proposals from one canonical snapshot. Read-only. Use mode:"compact" to minimise bytes, section to focus one slice, and query to filter by name, id, summary, title or tag.',
				inputSchema: z.object({
					mode: z.enum(['compact', 'full']).optional(),
					section: sectionEnum.optional(),
					query: z.string().optional(),
				}),
				outputSchema: snapshotSchema,
			},
			async (args: {
				mode?: 'compact' | 'full' | undefined;
				section?: CatalogSection | undefined;
				query?: string | undefined;
			}) => {
				const base = buildCatalog(options.sources, {
					mode: args.mode ?? 'compact',
					...(options.now !== undefined ? { now: options.now } : {}),
					server: options.server,
				});
				const narrowed = applySection(base, args.section);
				const { snapshot, matches } = applyQuery(narrowed, args.query);
				return toolOk({
					...(matches !== undefined ? { matches } : {}),
					...snapshot,
				});
			},
		);
	},
});
