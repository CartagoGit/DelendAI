import type { IProviderSummary } from '../contracts/interfaces/provider-capabilities.interface';
import {
	ACTIONABLE_PROPOSAL_STATUSES,
	type IBuildCatalogOptions,
	type ICatalogSnapshot,
	type ICatalogSources,
	type IProposalSummary,
	type ISkillSummary,
	type IToolSummary,
	PROPOSAL_STATUS_VALUES,
} from './agent-discovery-types';

const sortBy = <T>(items: readonly T[], select: (item: T) => string): T[] =>
	[...items].sort((left, right) => select(left).localeCompare(select(right)));

/**
 * A core tool's plugin is the namespace prefix the response already
 * carries in `server.namespacePrefix`, so only a plugin that differs from
 * it is worth its bytes — in either mode.
 */
const pluginField = (
	tool: IToolSummary,
	corePlugin: string,
): Pick<IToolSummary, 'plugin'> =>
	tool.plugin === undefined || tool.plugin === corePlugin
		? {}
		: { plugin: tool.plugin };

const cloneTool = (
	tool: IToolSummary,
	mode: 'compact' | 'full',
	corePlugin: string,
): IToolSummary => {
	if (mode === 'compact') {
		return { name: tool.name, ...pluginField(tool, corePlugin) };
	}
	return {
		name: tool.name,
		...pluginField(tool, corePlugin),
		...(tool.summary !== undefined ? { summary: tool.summary } : {}),
		...(tool.tags !== undefined ? { tags: [...tool.tags] } : {}),
		...(tool.effects !== undefined ? { effects: [...tool.effects] } : {}),
	};
};

/**
 * `bodyPath` is where the skill tool loads the body from; the skill tool's
 * own listing already returns it, so the full catalog does not repeat it.
 */
const cloneSkill = (
	skill: ISkillSummary,
	mode: 'compact' | 'full',
): ISkillSummary => ({
	id: skill.id,
	version: skill.version,
	minCoreVersion: skill.minCoreVersion,
	summary: skill.summary,
	appliesTo: [...skill.appliesTo],
	tags: [...skill.tags],
	...(mode === 'full' ? {} : { bodyPath: skill.bodyPath }),
	...(skill.plugin !== undefined ? { plugin: skill.plugin } : {}),
	...(skill.tools !== undefined ? { tools: [...skill.tools] } : {}),
});

/**
 * Copies only the lean, secret-free summary fields — never invoke details
 * or env-var names (the catalog is a discoverability artifact).
 */
const cloneProvider = (provider: IProviderSummary): IProviderSummary => ({
	id: provider.id,
	kind: provider.kind,
	modelId: provider.modelId,
	costTier: provider.costTier,
	reachable: provider.reachable,
	strengths: [...provider.strengths],
});

const cloneProposal = (proposal: IProposalSummary): IProposalSummary => ({
	id: proposal.id,
	title: proposal.title,
	track: proposal.track,
	status: proposal.status,
	kind: proposal.kind,
	// The date orders a backlog and says how old it is, in either mode;
	// dropped in compact mode, the committed catalog wrote "" for every
	// proposal (x00738).
	...(proposal.date !== undefined && proposal.date.length > 0
		? { date: proposal.date }
		: {}),
});

export const buildCatalog = (
	sources: ICatalogSources,
	opts: IBuildCatalogOptions,
): ICatalogSnapshot => {
	const allTools = sortBy(sources.tools(), (tool) => tool.name);
	const allSkills = sortBy(sources.skills(), (skill) => skill.id);
	const allProposals = sortBy(sources.proposals(), (proposal) => proposal.id);

	const proposalStatusCounts = Object.fromEntries(
		PROPOSAL_STATUS_VALUES.map((status) => [status, 0]),
	) as Record<(typeof PROPOSAL_STATUS_VALUES)[number], number>;
	for (const proposal of allProposals) {
		proposalStatusCounts[proposal.status] += 1;
	}

	const visibleProposals =
		opts.mode === 'compact'
			? allProposals.filter((proposal) =>
					ACTIONABLE_PROPOSAL_STATUSES.includes(proposal.status),
				)
			: allProposals;

	const tools = allTools.map((tool) =>
		cloneTool(tool, opts.mode, opts.server.namespacePrefix),
	);
	const skills = allSkills.map((skill) => cloneSkill(skill, opts.mode));
	const proposals = visibleProposals.map((proposal) =>
		cloneProposal(proposal),
	);

	// Providers: omitted (not `[]`) when the roster is absent or empty so
	// existing payloads never churn, and pruned from compact mode entirely —
	// `IProviderSummary` has no optional fields to strip, so unlike tools
	// the compact prune is all-or-nothing (agents opt in via mode:"full").
	const allProviders = sortBy(
		sources.providers?.() ?? [],
		(provider) => provider.id,
	);
	const providers =
		opts.mode === 'full' && allProviders.length > 0
			? allProviders.map(cloneProvider)
			: undefined;

	return {
		server: {
			name: opts.server.name,
			version: opts.server.version,
			namespacePrefix: opts.server.namespacePrefix,
		},
		generatedAt: (opts.now ?? (() => new Date()))().toISOString(),
		mode: opts.mode,
		counts: {
			tools: tools.length,
			skills: skills.length,
			proposals: proposals.length,
		},
		proposalStatusCounts,
		tools,
		skills,
		proposals,
		...(providers !== undefined ? { providers } : {}),
	};
};
