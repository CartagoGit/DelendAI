import type {
	IWorkspaceLayoutArgs,
	WorkspacePathStatus,
} from '../contracts/interfaces/workspace-layout.interface';

/**
 * f00109 S1 — dead-config diagnostics.
 *
 * A consumer project that copies `mcp-vertex.config.json` from another
 * repo boots silently on a layout that does not exist: `docsDir` points
 * nowhere, every `options.roots` entry names a folder from the other
 * repo, and each plugin quietly scans an empty tree. The agent then
 * never finds the proposals layout or the rules and falls back to
 * inventing its own workflow.
 *
 * This module is the pure detector for that state. The caller (the CLI
 * assembler) resolves + probes paths; this function only decides what
 * is an issue and renders the human-readable line. It reports, it never
 * blocks: a missing directory is a warning surfaced through the doctor
 * and the overview, not a boot failure — a fresh project may simply not
 * have scaffolded yet. Contracts live in
 * `contracts/interfaces/workspace-layout.interface.ts`.
 */

const describeDocsDir = (
	docsDir: string,
	status: WorkspacePathStatus,
): string =>
	status === 'escapes'
		? `docsDir: "${docsDir}" escapes the workspace root`
		: `docsDir: "${docsDir}" does not exist in this workspace — agent docs and the proposals layout resolve under it; scaffold it (mcp-vertex init) or point docsDir at the real docs root`;

const describeRoot = (
	pluginName: string,
	root: string,
	status: WorkspacePathStatus,
): string =>
	status === 'escapes'
		? `plugins.${pluginName}.options.roots: "${root}" escapes the workspace root`
		: `plugins.${pluginName}.options.roots: "${root}" does not exist in this workspace — the ${pluginName} plugin will scan nothing; point it at this project's real folders`;

/**
 * Report every configured path that does not exist in the workspace:
 * the resolved `docsDir` plus each string entry of every plugin's
 * `options.roots` (the shared convention used by search/docs/
 * conventions/…). Silent when no config file is present. Pure — the
 * filesystem stays behind the injected probe.
 */
export const diagnoseWorkspaceLayout = (
	args: IWorkspaceLayoutArgs,
): readonly string[] => {
	if (!args.configPresent) return [];
	const issues: string[] = [];

	const docsStatus = args.probe(args.docsDir);
	if (docsStatus !== 'exists') {
		issues.push(describeDocsDir(args.docsDir, docsStatus));
	}

	for (const [pluginName, entry] of Object.entries(
		args.config.plugins ?? {},
	)) {
		const roots = (entry?.options as { roots?: unknown } | undefined)
			?.roots;
		if (!Array.isArray(roots)) continue;
		for (const root of roots) {
			if (typeof root !== 'string' || root.length === 0) continue;
			const status = args.probe(root);
			if (status !== 'exists') {
				issues.push(describeRoot(pluginName, root, status));
			}
		}
	}
	return issues;
};
