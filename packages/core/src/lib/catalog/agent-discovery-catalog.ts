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

const cloneTool = (
	tool: IToolSummary,
	mode: 'compact' | 'full',
): IToolSummary => {
	if (mode === 'compact') {
		return {
			name: tool.name,
			plugin: tool.plugin,
		};
	}
	return {
		name: tool.name,
		plugin: tool.plugin,
		...(tool.summary !== undefined ? { summary: tool.summary } : {}),
		...(tool.tags !== undefined ? { tags: [...tool.tags] } : {}),
		...(tool.effects !== undefined ? { effects: [...tool.effects] } : {}),
	};
};

const cloneSkill = (skill: ISkillSummary): ISkillSummary => ({
	id: skill.id,
	version: skill.version,
	minCoreVersion: skill.minCoreVersion,
	summary: skill.summary,
	appliesTo: [...skill.appliesTo],
	tags: [...skill.tags],
	bodyPath: skill.bodyPath,
});

const cloneProposal = (proposal: IProposalSummary): IProposalSummary => ({
	id: proposal.id,
	title: proposal.title,
	track: proposal.track,
	status: proposal.status,
	kind: proposal.kind,
	date: proposal.date,
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

	const tools = allTools.map((tool) => cloneTool(tool, opts.mode));
	const skills = allSkills.map(cloneSkill);
	const proposals = visibleProposals.map(cloneProposal);

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
	};
};
