/** Wording helpers of the overview payload. */

const MAX_OVERVIEW_SUMMARY_CHARS = 96;

export const compactSummary = (
	summary: string | undefined,
): string | undefined => {
	if (summary === undefined) return undefined;
	if (summary.length <= MAX_OVERVIEW_SUMMARY_CHARS) return summary;
	return `${summary.slice(0, MAX_OVERVIEW_SUMMARY_CHARS - 3)}...`;
};

export const countGroupedTools = (
	groupedTools: Record<string, string[]>,
): number =>
	Object.values(groupedTools).reduce(
		(total, group) => total + group.length,
		0,
	);

export const buildOverviewSummary = (args: {
	readonly compact: boolean;
	readonly pluginCount: number;
	readonly toolCount: number;
	readonly knowledgeCount: number;
	readonly activationIncluded: boolean;
}): string =>
	`${args.compact ? 'compact ' : ''}overview: ${args.pluginCount} plugins, ${args.toolCount} visible tools, ${args.knowledgeCount} knowledge ids${args.activationIncluded ? ', activation included' : ''}`;
