import type { IFileReader, IProjectAnalysis } from './analyze-project';

const ADOPTION_SCRIPT_CONFLICTS = ['validate', 'typecheck', 'lint', 'test'];
const NON_DOC_ROOT_MARKDOWN = new Set(['agents.md', 'claude.md']);

const hasRootMarkdownBeyondReadme = (entries: readonly string[]): boolean =>
	entries.some(
		(entry) =>
			entry.toLowerCase().endsWith('.md') &&
			entry.toLowerCase() !== 'readme.md' &&
			!NON_DOC_ROOT_MARKDOWN.has(entry.toLowerCase()),
	);

export const detectCiProvider = (
	ci: readonly string[],
): NonNullable<IProjectAnalysis['ciProvider']> => {
	for (const provider of [
		'github-actions',
		'gitlab-ci',
		'circleci',
	] as const) {
		if (ci.includes(provider)) return provider;
	}
	return 'unknown';
};

export const detectDocsConventions = async (
	reader: IFileReader,
): Promise<readonly string[]> => {
	const out: string[] = [];
	const rootEntries = await reader.listDir('');
	if (await reader.exists('README.md')) out.push('README.md');
	if ((await reader.listDir('docs')).length > 0) out.push('docs/');
	if (hasRootMarkdownBeyondReadme(rootEntries)) out.push('root-markdown');
	if (
		(await reader.exists('astro.config.mjs')) ||
		(await reader.exists('astro.config.ts')) ||
		(await reader.exists('astro.config.js'))
	) {
		out.push('docs-site:astro');
	} else if (
		(await reader.exists('docusaurus.config.ts')) ||
		(await reader.exists('docusaurus.config.js')) ||
		(await reader.exists('docusaurus.config.mjs'))
	) {
		out.push('docs-site:docusaurus');
	} else if (
		(await reader.exists('vitepress.config.ts')) ||
		(await reader.exists('vitepress.config.js')) ||
		(await reader.listDir('.vitepress')).length > 0
	) {
		out.push('docs-site:vitepress');
	}
	return out;
};

export const detectConflicts = async (
	reader: IFileReader,
	scripts: Record<string, string>,
): Promise<readonly string[]> => {
	const out: string[] = [];
	for (const name of ADOPTION_SCRIPT_CONFLICTS) {
		if (scripts[name] !== undefined) out.push(`script:${name}`);
	}
	if (await reader.exists('mcp-vertex.config.json')) {
		out.push('config:mcp-vertex.config.json');
	}
	if (await reader.exists('.vscode/mcp.json')) {
		out.push('config:.vscode/mcp.json');
	}
	if (await reader.exists('.mcp.json')) {
		out.push('config:.mcp.json');
	}
	return out;
};
