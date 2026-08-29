import type {
	IPluginConfigurationIssue,
	IPluginConfigurationValidationInput,
	IMcpPlugin,
} from './plugin-contract';

export const formatPluginConfigurationIssue = (
	pluginName: string,
	issue: IPluginConfigurationIssue,
): string => {
	const lines = [
		`configuration conflict reported by plugin "${pluginName}" [${issue.code}]`,
		issue.message,
		`conflicting keys: ${issue.keys.join(', ')}`,
	];
	if (issue.values !== undefined) {
		lines.push(`effective values: ${JSON.stringify(issue.values)}`);
	}
	if (issue.precedence !== undefined) {
		lines.push(`precedence: ${issue.precedence}`);
	}
	if (issue.suggestedConfig !== undefined) {
		lines.push(
			`mcp-vertex.config.json patch:\n${JSON.stringify(issue.suggestedConfig, null, 2)}`,
		);
	}
	return lines.join('\n');
};

export const validatePluginConfiguration = async (input: {
	readonly plugins: readonly IMcpPlugin[];
	readonly pluginOptions: ReadonlyMap<
		string,
		Readonly<Record<string, unknown>>
	>;
	readonly enabledPlugins: readonly string[];
}): Promise<readonly string[]> => {
	const messages: string[] = [];
	for (const plugin of input.plugins) {
		if (plugin.validateConfiguration === undefined) continue;
		const issues = await plugin.validateConfiguration({
			pluginName: plugin.name,
			pluginOptions: input.pluginOptions,
			enabledPlugins: input.enabledPlugins,
		} satisfies IPluginConfigurationValidationInput);
		for (const issue of issues) {
			messages.push(formatPluginConfigurationIssue(plugin.name, issue));
		}
	}
	return messages;
};
