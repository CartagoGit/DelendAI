/**
 * debt-scan-coverage.spec.ts — `debt_scan` says what it did not read: the
 * files past its cap, too large or unreadable.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import { TECH_DEBT_MAX_FILES } from '../../../src/lib/contracts/constants/tech-debt.constant';
import type { ISourceFileScan } from '../../../src/lib/contracts/interfaces/tech-debt.interface';
import { buildDebtScanRegistration } from '../../../src/lib/tools/debt-scan.tool';

const run = async (scan: ISourceFileScan): Promise<Record<string, unknown>> => {
	const registerTool = vi.fn();
	await buildDebtScanRegistration({
		namespacePrefix: 'delendai',
		workspaceRootAbs: '/ws',
		deps: { listSourceFiles: async () => scan },
	}).register({ registerTool } as Pick<
		McpServer,
		'registerTool'
	> as McpServer);
	const [, meta, handler] = registerTool.mock.calls[0] as [
		string,
		{
			outputSchema: {
				parse: (value: unknown) => Record<string, unknown>;
			};
		},
		(args: object) => Promise<{ structuredContent?: unknown }>,
	];
	return meta.outputSchema.parse((await handler({})).structuredContent);
};

describe('debt_scan coverage', () => {
	it('reports a full scan as uncapped with nothing skipped', async () => {
		const output = await run({
			files: [{ path: 'src/a.ts', content: '// TODO: tidy\n' }],
			skipped: [],
			capped: false,
		});
		expect(output.filesScanned).toBe(1);
		expect(output.total).toBe(1);
		expect(output.coverage).toEqual({
			capped: false,
			maxFiles: TECH_DEBT_MAX_FILES,
			skippedTotal: 0,
			skipped: [],
		});
	});

	it('names the files it skipped and says when it stopped at its cap', async () => {
		const output = await run({
			files: [],
			skipped: [
				{ path: 'src/huge.ts', reason: 'too-large' },
				{ path: 'src/locked.ts', reason: 'unreadable' },
			],
			capped: true,
		});
		expect(output.coverage).toEqual({
			capped: true,
			maxFiles: TECH_DEBT_MAX_FILES,
			skippedTotal: 2,
			skipped: [
				{ path: 'src/huge.ts', reason: 'too-large' },
				{ path: 'src/locked.ts', reason: 'unreadable' },
			],
		});
	});
});
