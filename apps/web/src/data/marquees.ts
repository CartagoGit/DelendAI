import {
	siNodedotjs,
	siDeno,
	siBun,
	siTypescript,
	siJavascript,
	siNpm,
	siPnpm,
	siYarn,
	siVite,
	siEsbuild,
	siVitest,
	siBiome,
	siZod,
	siGit,
	siGithubactions,
	siDocker,
	siLinux,
	siGnubash,
	siClaude,
	siCursor,
	siWindsurf,
	siZedindustries,
	siGithubcopilot,
	siModelcontextprotocol,
	siNeovim,
	siJetbrains,
	siHelix,
	siWarp,
	siGooglegemini,
	siLangchain,
	siOllama,
	siRaycast,
	siObsidian,
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

// Built with / runs under — runtimes, managers and tooling.
export const runtimes: readonly IMarqueeItem[] = [
	logo('Node.js', siNodedotjs, 'no'),
	logo('Deno', siDeno, 'D'),
	logo('Bun', siBun, 'B'),
	logo('TypeScript', siTypescript, 'TS'),
	logo('JavaScript', siJavascript, 'JS'),
	logo('npm', siNpm, 'np'),
	logo('pnpm', siPnpm, 'pn'),
	logo('Yarn', siYarn, 'Y'),
	logo('Vite', siVite, 'Vi'),
	logo('esbuild', siEsbuild, 'es'),
	logo('Vitest', siVitest, 'Vt'),
	logo('Biome', siBiome, 'Bi'),
	logo('Zod', siZod, 'Z'),
	logo('Git', siGit, 'Gi'),
	logo('GitHub Actions', siGithubactions, 'GA'),
	logo('Docker', siDocker, 'Do'),
	logo('Linux', siLinux, 'Lx'),
	logo('Bash', siGnubash, 'sh'),
];

// MCP clients & model providers that speak the Model Context Protocol.
export const clients: readonly IMarqueeItem[] = [
	logo('Claude', siClaude, 'C'),
	logo('VS Code', { path: '' }, 'VS'), // brand icon unavailable → monogram
	logo('Cursor', siCursor, 'Cu'),
	logo('Windsurf', siWindsurf, 'W'),
	logo('Zed', siZedindustries, 'Z'),
	logo('GitHub Copilot', siGithubcopilot, 'Co'),
	logo('Neovim', siNeovim, 'Nv'),
	logo('JetBrains', siJetbrains, 'JB'),
	logo('Helix', siHelix, 'Hx'),
	logo('Warp', siWarp, 'Wp'),
	logo('Raycast', siRaycast, 'Ry'),
	logo('Obsidian', siObsidian, 'Ob'),
	logo('Gemini', siGooglegemini, 'Ge'),
	logo('LangChain', siLangchain, 'Lc'),
	logo('Ollama', siOllama, 'Ol'),
	logo('Model Context Protocol', siModelcontextprotocol, 'M'),
];
