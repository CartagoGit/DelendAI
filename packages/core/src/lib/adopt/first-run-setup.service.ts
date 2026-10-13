/**
 * first-run-setup.service.ts — a server started in a project with no
 * delendai sets the project up with the defaults.
 *
 * Starting the server was not enough to use delendai: with no
 * configuration the server ran on built-in defaults, wrote no agents and
 * no docs, and the agent had to know to call `adopt_project` first.
 * Now the first start adopts the project with the defaults, exactly as
 * `adopt_project` with `write: true` would, and says what it created.
 * Only a Git work tree's root counts as a project: a server started in a
 * home or scratch directory writes nothing there.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createWorkspaceFileReader } from '../bootstrap/workspace-file-reader';
import { DEFAULT_CORE_PATHS } from '../contracts/interfaces/core-paths.interface';
import { DEFAULT_CONFIG_FILENAME } from '../plugins/load-config-file';
import { createWorkspacePathProvider } from '../workspace/create-workspace-path-provider';
import { runAdoptProject } from './adopt-project.tool';

/**
 * The files the first start created, or `undefined` when the project
 * already had delendai, or is not a project.
 */
export const firstRunSetup = async (
	workspaceRoot: string,
	namespacePrefix = 'delendai',
): Promise<readonly string[] | undefined> => {
	if (existsSync(join(workspaceRoot, DEFAULT_CONFIG_FILENAME)))
		return undefined;
	if (!existsSync(join(workspaceRoot, '.git'))) return undefined;
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
	return outcome.ok
		? [DEFAULT_CONFIG_FILENAME, ...outcome.data.created]
		: undefined;
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
