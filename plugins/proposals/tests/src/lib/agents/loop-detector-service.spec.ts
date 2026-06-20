import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentLoopDetectorService } from '@mcp-vertex/proposals/lib/agents/loop-detector-service';
import { createWorkspacePathProvider } from '@mcp-vertex/core/public';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

describe('AgentLoopDetectorService', () => {
	let dir = '';
	let mockCtx: IMcpPluginContext;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'loop-detector-test-'));

		// Create a minimal workspace directory structure
		const workspace = createWorkspacePathProvider(dir);
		mockCtx = {
			workspace,
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: join(dir, '.cache/mcp-vertex'),
			docsDir: join(dir, 'docs/mcp-vertex'),
			pluginCacheDir: join(dir, '.cache/mcp-vertex/proposals'),
			pluginDocsDir: join(dir, 'docs/mcp-vertex/proposals'),
			namespacePrefix: 'proposals',
			options: {},
			args: {},
		};
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('initializes with default options and is enabled by default', () => {
		const service = new AgentLoopDetectorService(mockCtx);
		expect(service).toBeDefined();
		expect(service.isAgentStuck('read_file', {})).toBeNull();
	});

	it('disables loop detection when --no-loop-detector flag is passed', async () => {
		const ctxWithFlag = {
			...mockCtx,
			args: { 'no-loop-detector': 'true' },
		};
		const service = new AgentLoopDetectorService(ctxWithFlag);

		// Simulate exact repeat tools
		for (let i = 0; i < 5; i++) {
			await service.onToolCall(
				'read_file',
				{ path: 'foo.ts', agent: 'a1' },
				{ ok: true },
			);
		}

		// Because it is disabled, it shouldn't record the stuck agent
		expect(service.isAgentStuck('read_file', { agent: 'a1' })).toBeNull();
	});

	it('flags stuck and writes handoff packet on exact-repeat calls', async () => {
		const service = new AgentLoopDetectorService(mockCtx);

		// Call exact-repeat tool 3 times
		for (let i = 0; i < 3; i++) {
			await service.onToolCall(
				'read_file',
				{ path: 'foo.ts', agent: 'a1' },
				{ ok: true },
			);
		}

		const stuck = service.isAgentStuck('read_file', { agent: 'a1' });
		expect(stuck).not.toBeNull();
		expect(stuck?.handoffPath).toContain('a1-');
		expect(stuck?.suggestedAction).toContain(
			'STOP — stuck detected due to exact-repeat',
		);

		// Check if the handoff packet was written to cache
		const handoffDirAbs = mockCtx.workspace.resolve('.mcp-vertex/handoff');
		expect(existsSync(handoffDirAbs)).toBe(true);
	});

	it('redacts secrets in the written handoff packet recent calls', async () => {
		const service = new AgentLoopDetectorService(mockCtx);

		// Call exact-repeat with a Stripe key
		for (let i = 0; i < 3; i++) {
			await service.onToolCall(
				'read_file',
				{
					path: 'foo.ts',
					agent: 'a1',
					key: 'sk_test_1234567890abcdef12345',
				},
				{ ok: true },
			);
		}

		const stuck = service.isAgentStuck('read_file', { agent: 'a1' });
		expect(stuck).not.toBeNull();

		// Read written handoff file
		const handoffDirAbs = mockCtx.workspace.resolve('.mcp-vertex/handoff');
		const files = await import('node:fs/promises').then((fs) =>
			fs.readdir(handoffDirAbs),
		);
		const handoffFile = files.find(
			(f) => f.startsWith('a1-') && f.endsWith('.json'),
		);
		expect(handoffFile).toBeDefined();

		const handoffContent = readFileSync(
			join(handoffDirAbs, handoffFile!),
			'utf8',
		);
		const packet = JSON.parse(handoffContent);
		expect(packet.recentToolCalls[0].args.key).toBe('[REDACTED]');
	});

	it('flags stuck on no-progress modifying tool calls', async () => {
		// Initialize git repo in the temp directory
		const { execSync } = await import('node:child_process');
		execSync('git init -q', { cwd: dir });
		execSync('git config user.email "t@t.t"', { cwd: dir });
		execSync('git config user.name "T"', { cwd: dir });

		// Create and commit a file so git diff has a baseline
		const testFile = join(dir, 'test.txt');
		writeFileSync(testFile, 'initial content');
		execSync('git add test.txt', { cwd: dir });
		execSync('git commit -m "initial"', { cwd: dir });

		const service = new AgentLoopDetectorService(mockCtx);

		// Call a modifying tool 3 times with different arguments without making changes
		for (let i = 0; i < 3; i++) {
			await service.onToolCall(
				'edit_file',
				{ path: 'test.txt', agent: 'a1', val: i },
				{ ok: true },
			);
		}

		const stuck = service.isAgentStuck('edit_file', { agent: 'a1' });
		expect(stuck).not.toBeNull();
		expect(stuck?.suggestedAction).toContain(
			'STOP — stuck detected due to no-progress',
		);
	});
});
