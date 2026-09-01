/**
 * real-deps.ts — the production I/O adapter for the secret scanner: file
 * lists come from `git ls-files` (so .gitignore is respected for free) via the
 * shared `runExternalTool` seam, and file reads come from the filesystem.
 * The only module here that touches the OS.
 */
import { runExternalTool, SafeWorkspaceReader } from '@mcp-vertex/core/public';
import type { IExternalTool } from '@mcp-vertex/core/public';

import type { ISecretScanDeps } from '../contracts/interfaces/secrets.interface';

const GIT_TOOL: IExternalTool = { id: 'git', bin: 'git' };

/** Production scan deps rooted at `workspaceRootAbs`. */
export const realScanDeps = (workspaceRootAbs: string): ISecretScanDeps => {
	const reader = new SafeWorkspaceReader(workspaceRootAbs);
	return {
		listFiles: async (scope) => {
			const args =
				scope === 'changed'
					? [
							'ls-files',
							'--modified',
							'--others',
							'--exclude-standard',
						]
					: ['ls-files'];
			const run = await runExternalTool({
				tool: GIT_TOOL,
				args,
				cwd: workspaceRootAbs,
				maxOutputBytes: 4 * 1024 * 1024,
			});
			if (!run.ok) return [];
			return run.stdout
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
		},
		readFile: async (path) => {
			try {
				return (await reader.readText(path)).content;
			} catch {
				return undefined;
			}
		},
	};
};
