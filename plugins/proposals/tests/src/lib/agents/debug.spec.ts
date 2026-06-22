import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AgentLoopDetectorService } from '@mcp-vertex/proposals/lib/agents/loop-detector-service';
import { createWorkspacePathProvider } from '@mcp-vertex/core/public';

describe('debug-falcon', () => {
	it('logs state after 9 calls', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'loop-debug-'));
		const stderrSpy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
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
			console.log(
				'repeatThreshold:',
				(service as any).options.repeatThreshold,
			);
			console.log(
				'interactiveAgentPatterns:',
				(service as any).options.interactiveAgentPatterns,
			);
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
			console.log('stuck:', stuck);
			console.log(
				'stuckAgents:',
				Array.from((service as any).stuckAgents.entries()),
			);
			console.log(
				'windowMap sizes:',
				Array.from((service as any).windowMap.entries()).map(
					([k, v]) => [k, v.length],
				),
			);
			console.log(
				'isInteractiveAgent("falcon"):',
				(service as any).isInteractiveAgent('falcon'),
			);
			expect(stuck).not.toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
			stderrSpy.mockRestore();
		}
	});
});
