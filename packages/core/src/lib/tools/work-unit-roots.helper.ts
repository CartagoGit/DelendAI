/**
 * work-unit-roots.helper.ts — a unit is created in the project its client
 * is working on, or not at all.
 *
 * The `work` tool runs in the server's workspace root and takes no
 * project argument. On 2026-10-01 a unit named for another project's
 * agent (`logistics-orchestrator`, proposal `q00034`, neither of which
 * exists here) appeared in this repository: a client working elsewhere
 * reached a server serving this one, and its work would have been
 * committed into the wrong repository.
 *
 * MCP lets the server ask the client which roots it works in. When the
 * client answers, and none of its roots has anything to do with the
 * server's workspace, a writing action is refused and both are named.
 * A client that declares no roots, or does not answer in time, is not
 * judged: nothing is known, so nothing changes.
 */
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** The actions that write into the repository the server serves. */
const WRITING_ACTIONS: ReadonlySet<string> = new Set([
	'claim',
	'enter',
	'checkpoint',
	'publish',
	'retire',
]);

/** How long a client gets to name its roots before it is not judged. */
const ROOTS_TIMEOUT_MS = 2_000;

/** Whether `inner` is `outer` or lies inside it. */
const within = (outer: string, inner: string): boolean => {
	const path = relative(outer, inner);
	return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

/** The repository a directory belongs to, as its git common directory. */
const repositoryOf = (directory: string): string | undefined => {
	try {
		return execFileSync(
			'git',
			['rev-parse', '--path-format=absolute', '--git-common-dir'],
			{
				cwd: directory,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			},
		).trim();
	} catch {
		return undefined;
	}
};

/** Whether this action writes into the served repository. */
export const writesToRepository = (action: string): boolean =>
	WRITING_ACTIONS.has(action);

/**
 * The client's root directories that have nothing to do with the
 * workspace, or `undefined` when at least one does — it contains the
 * workspace, lies inside it, or is a worktree of the same repository —
 * or when the client named no directory at all.
 */
export const rootsElsewhere = (
	rootUris: readonly string[],
	workspaceRoot: string,
	repository: (directory: string) => string | undefined = repositoryOf,
): readonly string[] | undefined => {
	const roots = rootUris
		.filter((uri) => uri.startsWith('file://'))
		.map((uri) => resolve(fileURLToPath(uri)));
	if (roots.length === 0) return undefined;
	const workspace = resolve(workspaceRoot);
	const served = repository(workspace);
	const related = roots.some(
		(root) =>
			within(root, workspace) ||
			within(workspace, root) ||
			(served !== undefined && repository(root) === served),
	);
	return related ? undefined : roots;
};

/** What a client working elsewhere is told. */
export const describeRootsElsewhere = (
	roots: readonly string[],
	workspaceRoot: string,
): string =>
	`This delendai server serves ${workspaceRoot}, and your client works in ${roots.join(', ')}: a unit created here would commit your work into the wrong repository. Start delendai with --workspace=<your project> (or open it from your project's directory) and call this tool there.`;

/**
 * The roots the client says it works in, or `undefined` when it does not
 * offer them or does not answer in time.
 */
export const clientRootUris = async (
	server: McpServer,
	timeoutMs: number = ROOTS_TIMEOUT_MS,
): Promise<readonly string[] | undefined> => {
	if (server.server.getClientCapabilities()?.roots === undefined) {
		return undefined;
	}
	try {
		const listed = await server.server.listRoots(undefined, {
			timeout: timeoutMs,
		});
		return listed.roots.map((root) => root.uri);
	} catch {
		return undefined;
	}
};
