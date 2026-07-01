import { MemoryService } from '@mcp-vertex/client';

import type { ICommandDeps } from './types';

export const MEMORY_SAVE_COMMAND = 'mcp-vertex.memorySave';

export const registerMemorySaveCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		MEMORY_SAVE_COMMAND,
		async (rawInput?: unknown) => {
			const input =
				rawInput !== null && typeof rawInput === 'object'
					? (rawInput as {
							readonly title?: string;
							readonly body?: string;
						})
					: undefined;
			const title = input?.title?.trim() || 'Untitled memory note';
			const body = input?.body?.trim() || title;
			const result = await new MemoryService(deps.client).save({
				title,
				body,
				tags: ['vscode'],
			});
			await deps.vscode.window.showInformationMessage?.(
				`mcp-vertex: saved memory note ${result.saved.id}`,
			);
			deps.memoryTree?.refresh();
			return result;
		},
	);
