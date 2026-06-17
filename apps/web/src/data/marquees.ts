import {
	siNodedotjs,
	siDeno,
	siBun,
	siTypescript,
	siJavascript,
	siNpm,
	siPnpm,
	siYarn,
	siClaude,
	siGithubcopilot,
	siZedindustries,
	siCursor,
	siWindsurf,
	siModelcontextprotocol,
} from 'simple-icons';

export interface IMarqueeItem {
	/** Display name, revealed on hover. */
	readonly name: string;
	/** Real brand SVG path (24×24 viewBox), rendered monochrome. */
	readonly path?: string;
	/** Monogram fallback when no brand logo is available. */
	readonly mono: string;
}

type SimpleIcon = { readonly path: string };
const logo = (name: string, icon: SimpleIcon, mono: string): IMarqueeItem => ({
	name,
	path: icon.path,
	mono,
});

// Runtimes & package managers mcp-core runs under / installs with.
export const runtimes: readonly IMarqueeItem[] = [
	logo('Node.js', siNodedotjs, 'no'),
	logo('Deno', siDeno, 'D'),
	logo('Bun', siBun, 'B'),
	logo('TypeScript', siTypescript, 'TS'),
	logo('JavaScript', siJavascript, 'JS'),
	logo('npm', siNpm, 'np'),
	logo('pnpm', siPnpm, 'pn'),
	logo('Yarn', siYarn, 'Y'),
];

// MCP clients & model providers that speak the Model Context Protocol.
export const clients: readonly IMarqueeItem[] = [
	logo('Claude', siClaude, 'C'),
	logo('VS Code', { path: '' }, 'VS'), // brand icon unavailable → monogram
	logo('Cursor', siCursor, 'Cu'),
	logo('Windsurf', siWindsurf, 'W'),
	logo('Zed', siZedindustries, 'Z'),
	logo('GitHub Copilot', siGithubcopilot, 'Co'),
	logo('Model Context Protocol', siModelcontextprotocol, 'M'),
];
