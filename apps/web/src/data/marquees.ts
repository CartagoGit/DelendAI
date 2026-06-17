export interface IMarqueeItem {
	/** Display name, revealed on hover. */
	readonly name: string;
	/** Short monogram shown in the chip. */
	readonly mono: string;
	/** Brand-ish accent colour for the chip. */
	readonly color: string;
}

// Runtimes & package managers mcp-core runs under / installs with.
export const runtimes: readonly IMarqueeItem[] = [
	{ name: 'Node.js', mono: 'no', color: '#5FA04E' },
	{ name: 'Deno', mono: 'D', color: '#70C7C2' },
	{ name: 'Bun', mono: 'B', color: '#FBF0DF' },
	{ name: 'TypeScript', mono: 'TS', color: '#3178C6' },
	{ name: 'npm', mono: 'np', color: '#CB3837' },
	{ name: 'pnpm', mono: 'pn', color: '#F69220' },
	{ name: 'Yarn', mono: 'Y', color: '#2C8EBB' },
	{ name: 'JavaScript', mono: 'JS', color: '#F7DF1E' },
];

// MCP clients & model providers that speak the Model Context Protocol.
export const clients: readonly IMarqueeItem[] = [
	{ name: 'Claude', mono: 'C', color: '#D97757' },
	{ name: 'VS Code', mono: 'VS', color: '#007ACC' },
	{ name: 'Cursor', mono: 'Cu', color: '#9CA3AF' },
	{ name: 'Windsurf', mono: 'W', color: '#09B6A2' },
	{ name: 'Zed', mono: 'Z', color: '#084CCF' },
	{ name: 'Copilot', mono: 'Co', color: '#6E40C9' },
	{ name: 'Antigravity', mono: 'Ag', color: '#4285F4' },
	{ name: 'MCP', mono: 'M', color: '#8B5CF6' },
];
