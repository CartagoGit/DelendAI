/**
 * portable-entry.helper.ts — the host entry written into a project's MCP
 * configuration, relative to the workspace and not to this machine.
 *
 * The configuration is a file a project shares. Written absolute, it
 * carried one person's home directory: a colleague's server started
 * `/home/<someone-else>/…/host-server.script.ts` and exited with
 * `Module not found`.
 */
import { isAbsolute, relative, sep } from 'node:path';

/** `${workspaceFolder}/<path from the workspace>`, with forward slashes. */
export const entryFromWorkspace = (
	workspace: string,
	entry: string,
): string => {
	const fromWorkspace = relative(workspace, entry);
	if (fromWorkspace.length === 0 || isAbsolute(fromWorkspace)) return entry;
	return `\${workspaceFolder}/${fromWorkspace.split(sep).join('/')}`;
};
