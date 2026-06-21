import type { McpVertexToolOutputs } from '@mcp-vertex/client';

import type { ICommandDeps } from './types';
import { renderJsonHtml, showCommandError } from './types';

export const RUN_VALIDATION_COMMAND = 'mcp-vertex.runValidation';

interface IQualityRunOutput {
	readonly scope: string;
	readonly ok: boolean;
	readonly results: ReadonlyArray<{
		readonly command: string;
		readonly ok: boolean;
		readonly code: number;
		readonly timedOut: boolean;
		readonly tail: string;
	}>;
}

export const registerRunValidationCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(RUN_VALIDATION_COMMAND, async () => {
		try {
			const matrix = await deps.client.request<
				Record<string, never>,
				McpVertexToolOutputs['mcp-vertex_get_validation_matrix']
			>('mcp-vertex_get_validation_matrix', {});
			const quality = await deps.client.request<
				{ scope: string; dryRun: boolean },
				IQualityRunOutput
			>('quality_run_quality', { scope: 'all', dryRun: true });
			const panel = deps.vscode.window.createWebviewPanel(
				'mcpVertexValidation',
				'mcp-vertex Validation',
				deps.vscode.ViewColumn.One,
				{ enableScripts: false },
			);
			panel.webview.html = renderJsonHtml('mcp-vertex Validation', {
				matrix,
				quality,
			});
		} catch (err) {
			await showCommandError(deps.vscode, 'run validation', err);
		}
	});
