import { MemoryService } from '@mcp-vertex/client';

import type { ICommandDeps } from './types';

export const MEMORY_FORGET_COMMAND = 'mcp-vertex.memoryForget';

export const registerMemoryForgetCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		MEMORY_FORGET_COMMAND,
		async (rawId?: unknown) => {
			const id = typeof rawId === 'string' ? rawId : undefined;
			if (id === undefined || id.trim().length === 0) {
				await deps.vscode.window.showErrorMessage?.(
					'mcp-vertex: memoryForget requires a note id.',
				);
				return undefined;
			}
			const result = await new MemoryService(deps.client).forget(id);
			await deps.vscode.window.showInformationMessage?.(
				`mcp-vertex: removed memory note ${result.removed}`,
			);
			deps.memoryTree?.refresh();
			return result;
		},
	);
