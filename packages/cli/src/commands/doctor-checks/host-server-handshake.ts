import type { IDoctorCommandCheck } from '../doctor';

const countOverviewTools = (tools: unknown): number | undefined => {
	if (Array.isArray(tools)) return tools.length;
	if (tools !== null && typeof tools === 'object') {
		return Object.values(tools).reduce((sum, value) => {
			if (!Array.isArray(value)) return sum;
			return sum + value.length;
		}, 0);
	}
	return undefined;
};

export const checkHostServerHandshake: IDoctorCommandCheck = async ({
	cli,
}) => {
	try {
		const overview = await cli.request<Record<string, unknown>>(
			'delendai_overview',
			{ compact: true },
		);
		let toolCount: number | undefined;
		try {
			toolCount = (await cli.listTools()).length;
		} catch {
			toolCount = countOverviewTools(overview.tools);
		}
		const findings = ['local MCP overview handshake succeeded'];
		if (typeof toolCount === 'number') {
			findings.push(
				`${toolCount} tool(s) visible through the CLI transport`,
			);
		}
		return {
			name: 'mcp-handshake',
			status: 'ok',
			findings,
		};
	} catch (error) {
		return {
			name: 'mcp-handshake',
			status: 'error',
			findings: [
				`could not complete local MCP handshake: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
};
