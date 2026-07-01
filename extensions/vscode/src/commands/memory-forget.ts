import { MemoryService } from '@mcp-vertex/client';

import type { ICommandDeps } from './types';

export const MEMORY_FORGET_COMMAND = 'mcp-vertex.memoryForget';

export const registerMemoryForgetCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(
		MEMORY_FORGET_COMMAND,
		async (rawId?: unknown) => {
			// Bug fix: the previous version emitted an error toast AND
			// returned `undefined` (no rejection). VS Code's tree-view
			// menu then had no signal to refresh the tree when the
			// caller passed a bad id, which left the deleted row stuck
			// in the UI. We now resolve with an `{ ok: false, reason }`
			// discriminated union so callers can branch on success/failure
			// uniformly (and we still surface the toast for the user).
			const id = typeof rawId === 'string' ? rawId : undefined;
			if (id === undefined || id.trim().length === 0) {
				await deps.vscode.window.showErrorMessage?.(
					'mcp-vertex: memoryForget requires a note id.',
				);
				return { ok: false as const, reason: 'missing-id' as const };
			}
			try {
				const result = await new MemoryService(deps.client).forget(id);
				await deps.vscode.window.showInformationMessage?.(
					`mcp-vertex: removed memory note ${result.removed}`,
				);
				deps.memoryTree?.refresh();
				return { ok: true as const, removed: result.removed };
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				await deps.vscode.window.showErrorMessage?.(
					`mcp-vertex: forget failed: ${detail}`,
				);
				return { ok: false as const, reason: 'forget-failed' as const };
			}
		},
	);
