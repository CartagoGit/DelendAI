/**
 * tool-search-next-step.helper.ts — what a search result says to do when
 * the tool it found is not on the live surface yet.
 *
 * `active: false` alone left an agent to guess; one went around a hidden
 * authoring tool by writing files by hand. The step is named in the same
 * entry: activate the plugin, refresh tools/list, then call it.
 */
export const hiddenToolNextStep = (input: {
	readonly name: string;
	readonly pluginId?: string | undefined;
	readonly namespace?: string | undefined;
}): string => {
	const plugin = input.pluginId ?? input.namespace;
	return plugin === undefined
		? `${input.name} is hidden on this surface: call it through compact_router, or ask the host to show it.`
		: `${input.name} is hidden: call plugin_activate with plugin "${plugin}", refresh tools/list, then call ${input.name} (or reach it now through compact_router). Do not do its work by hand.`;
};
