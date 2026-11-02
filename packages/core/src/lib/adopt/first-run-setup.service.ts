/**
 * first-run-setup.service.ts — a server started in a project with no
 * delendai sets the project up with the defaults.
 *
 * Starting the server was not enough to use delendai: with no
 * configuration the server ran on built-in defaults, wrote no agents and
 * no docs, and the agent had to know to call `adopt_project` first.
 * Now the first start adopts the project with the defaults, exactly as
 * `adopt_project` with `write: true` would, and says what it created.
 * Consent is the project's own: only a Git work tree whose own MCP
 * configuration (`.vscode/mcp.json`, `.mcp.json`) registers delendai is
 * set up. A server a user-wide configuration starts in every project an
 * editor opens writes nothing in them — that is what once rewrote files
 * in projects that had nothing to do with delendai.
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { createWorkspaceFileReader } from '../bootstrap/workspace-file-reader';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import { DEFAULT_CONFIG_FILENAME } from '../plugins/load-config-file';
import { writeFileAtomic } from '../shared/atomic-write';
import { createWorkspacePathProvider } from '../workspace/create-workspace-path-provider';
import { findDelendaiServerName } from '../scaffold/detect-existing-install';
import { runAdoptProject } from './adopt-project.tool';

const DOCS_README = `# delendai\n\nThe documents delendai and its plugins keep for this project live under this folder. Its location is \`docsDir\` in \`${DEFAULT_CONFIG_FILENAME}\`.\n`;

const PROJECT_MCP_CONFIGS = ['.vscode/mcp.json', '.mcp.json'] as const;

/** Whether the project itself registers delendai as one of its servers. */
const projectRegistersDelendai = async (root: string): Promise<boolean> => {
	for (const file of PROJECT_MCP_CONFIGS) {
		const text = await readFile(join(root, file), 'utf8').catch(
			() => undefined,
		);
		if (text !== undefined && findDelendaiServerName(text) !== undefined)
			return true;
	}
	return false;
};

const exists = (path: string): Promise<boolean> =>
	stat(path).then(
		() => true,
		() => false,
	);

/**
 * The files the first start created, or `undefined` when the project
 * already had delendai, or is not a project.
 */
export const firstRunSetup = async (
	workspaceRoot: string,
	namespacePrefix = 'delendai',
): Promise<readonly string[] | undefined> => {
	if (await exists(join(workspaceRoot, DEFAULT_CONFIG_FILENAME)))
		return undefined;
	if (!(await exists(join(workspaceRoot, '.git')))) return undefined;
	if (!(await projectRegistersDelendai(workspaceRoot))) return undefined;
	const workspace = createWorkspacePathProvider(workspaceRoot);
	const outcome = await runAdoptProject(
		{
			namespacePrefix,
			workspace,
			corePaths: DEFAULT_CORE_PATHS,
			reader: createWorkspaceFileReader(workspace),
		},
		{ write: true },
	);
	if (!outcome.ok) return undefined;
	// The docs root the configuration names; adoption writes the agents but
	// not this, and the server warns at every start while it is missing.
	const docsDir =
		typeof outcome.data.config.docsDir === 'string'
			? outcome.data.config.docsDir
			: DEFAULT_CORE_PATHS.docsDir;
	const docsReadme = join(docsDir, 'README.md');
	const created = [DEFAULT_CONFIG_FILENAME, ...outcome.data.created];
	if (!(await exists(join(workspaceRoot, docsReadme)))) {
		await writeFileAtomic(join(workspaceRoot, docsReadme), DOCS_README);
		created.push(docsReadme);
	}
	return created;
};

/** The first start's one line, or nothing; never fails a start. */
export const reportFirstRunSetup = async (
	workspaceRoot: string,
	namespacePrefix?: string,
	write: (line: string) => void = (line) => process.stderr.write(line),
): Promise<void> => {
	try {
		const created = await firstRunSetup(workspaceRoot, namespacePrefix);
		if (created === undefined || created.length === 0) return;
		write(
			`[delendai] first start in this project: set it up with the defaults (${created.join(', ')}). Edit ${DEFAULT_CONFIG_FILENAME} to change them; the next start brings the rest in line.\n`,
		);
	} catch (error) {
		write(
			`[delendai] could not set this project up: ${error instanceof Error ? error.message : String(error)}. Call adopt_project to see why.\n`,
		);
	}
};
