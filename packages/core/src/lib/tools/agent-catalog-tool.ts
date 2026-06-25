import { z } from 'zod';

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
	plugin: z.string(),
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
	tags: z.array(z.string()),
	bodyPath: z.string(),
});

const proposalSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	track: z.string(),
	status: proposalStatusEnum,
	kind: proposalKindEnum,
	date: z.string(),
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
	tagsInclude(skill.tags, query);

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
