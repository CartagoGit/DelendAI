import z from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolJsonWithSummary } from '../shared/tool-response';
import { compactOutputSchema } from '../surface/compact-output-schema.helper';
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

const buildCatalogSummary = (args: {
	readonly toolCount: number;
	readonly skillCount: number;
	readonly proposalCount: number;
	readonly matches?: number;
}): string =>
	`${args.toolCount} tools, ${args.skillCount} skills, ${args.proposalCount} proposals${args.matches !== undefined ? `, ${args.matches} matches` : ''}`;

const countMatches = (snapshot: ICatalogSnapshot): number =>
	snapshot.tools.length + snapshot.skills.length + snapshot.proposals.length;

/** Lean skill projection returned by the default orientation call. */
type TLeanSkill = Pick<ISkillSummary, 'id' | 'tags'>;

type TCatalogPayload = Omit<ICatalogSnapshot, 'skills'> & {
	readonly skills: readonly (ISkillSummary | TLeanSkill)[];
};

/**
 * Token-budget projection for the default orientation call
 * (compact mode, no section, no query): drop the tool list — `overview`
 * already returns every tool name, grouped by plugin, for fewer bytes —
 * and trim skills to {id, tags}. `counts` still reports the real totals,
 * and any section/query call keeps the full entries.
 */
const applyOrientationProjection = (
	snapshot: ICatalogSnapshot,
): TCatalogPayload => ({
	...snapshot,
	tools: [],
	skills: snapshot.skills.map((skill) => ({
		id: skill.id,
		tags: [...skill.tags],
	})),
});

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
					'Unified discovery catalog for this MCP server: tools, versioned skills and actionable proposals from one canonical snapshot. Read-only. The default compact orientation call returns counts, actionable proposals and lean skill ids (tool names come from overview). Use section to fetch one full slice, query to filter by name, id, summary, title or tag, and mode:"full" for everything.',
				inputSchema: z.object({
					mode: z.enum(['compact', 'full']).optional(),
					section: sectionEnum.optional(),
					query: z.string().optional(),
				}),
				// v00129 S1 (AUD-B01): the full nested catalog snapshot
				// schema cost ~3.5 KB per tools/list entry for a shape the
				// model needs only after calling — and this tool is in the
				// bootstrap set every preset always sends. See
				// compact-output-schema.ts.
				outputSchema: compactOutputSchema(),
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
				const isDefaultOrientation =
					(args.mode ?? 'compact') === 'compact' &&
					args.section === undefined &&
					(args.query === undefined ||
						args.query.trim().length === 0);
				const payload: TCatalogPayload = isDefaultOrientation
					? applyOrientationProjection(snapshot)
					: snapshot;
				const structured = {
					ok: true,
					...(matches !== undefined ? { matches } : {}),
					...payload,
				};
				return toolJsonWithSummary(
					structured,
					buildCatalogSummary({
						toolCount: payload.tools.length,
						skillCount: payload.skills.length,
						proposalCount: payload.proposals.length,
						...(matches !== undefined ? { matches } : {}),
					}),
				);
			},
		);
	},
});
