import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentLoopDetectorService } from '@mcp-vertex/proposals/lib/agents/loop-detector-service';
import { createWorkspacePathProvider } from '@mcp-vertex/core/public';

describe('debug-falcon', () => {
	it('logs state after 9 calls (no stderr spy)', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'loop-debug-'));
		try {
			const workspace = createWorkspacePathProvider(dir);
			const mockCtx = {
				workspace,
				corePaths: {
					cacheDir: '.cache/mcp-vertex',
					docsDir: 'docs/mcp-vertex',
				},
				cacheDir: join(dir, '.cache/mcp-vertex'),
				docsDir: join(dir, 'docs/mcp-vertex'),
				keepLegacy: false,
				pluginCacheDir: join(dir, '.cache/mcp-vertex/proposals'),
				pluginDocsDir: join(dir, 'docs/mcp-vertex/proposals'),
				namespacePrefix: 'proposals',
				options: {},
				args: {},
			};
			const service = new AgentLoopDetectorService(mockCtx);
			for (let i = 0; i < 9; i++) {
				await service.onToolCall(
					'edit_file',
					{ path: 'foo.ts', agent: 'falcon', val: i },
					{ ok: true },
				);
			}
			const stuck = service.isAgentStuck('edit_file', {
				agent: 'falcon',
			});
			// Use console.log (not stubbed) to surface state.
			// eslint-disable-next-line no-console
			console.log(
				'DEBUG_OUT',
				JSON.stringify({
					threshold: (
						service as unknown as {
							options: { repeatThreshold: number };
						}
					).options.repeatThreshold,
					stuck,
					stuckAgents: Array.from(
						(
							service as unknown as {
								stuckAgents: Map<string, unknown>;
							}
						).stuckAgents.entries(),
					),
					windowMapSizes: Array.from(
						(
							service as unknown as {
								windowMap: Map<string, unknown[]>;
							}
						).windowMap.entries(),
					).map(([k, v]) => [k, v.length]),
					isInteractiveFalcon: (
						service as unknown as {
							isInteractiveAgent: (s: string) => boolean;
						}
					).isInteractiveAgent('falcon'),
				}),
			);
			expect(stuck).not.toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
