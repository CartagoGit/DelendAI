/**
 * link-check-coverage.spec.ts — `link_check` says what it did not read:
 * the documents past its cap, too large or unreadable.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import { LINK_CHECK_MAX_DOCS } from '../../../src/lib/contracts/constants/link-check.constant';
import type { IDocScan } from '../../../src/lib/contracts/interfaces/link-check.interface';
import { buildLinkCheckRegistration } from '../../../src/lib/tools/link-check.tool';

const run = async (scan: IDocScan): Promise<Record<string, unknown>> => {
	const registerTool = vi.fn();
	await buildLinkCheckRegistration({
		namespacePrefix: 'delendai',
		workspaceRootAbs: '/ws',
		deps: {
			listDocs: async () => scan,
			listKnownPaths: async () => new Set(['docs', 'docs/a.md']),
		},
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
		() => Promise<{ structuredContent?: unknown }>,
	];
	return meta.outputSchema.parse((await handler()).structuredContent);
};

describe('link_check coverage', () => {
	it('checks an MDX document like a markdown one', async () => {
		const output = await run({
			docs: [{ path: 'docs/page.mdx', content: '[gone](./missing.md)' }],
			skipped: [],
			capped: false,
		});
		expect(output.docsScanned).toBe(1);
		expect(output.total).toBe(1);
		expect(output.coverage).toEqual({
			capped: false,
			maxDocs: LINK_CHECK_MAX_DOCS,
			skippedTotal: 0,
			skipped: [],
		});
	});

	it('names the documents it skipped and says when it stopped at its cap', async () => {
		const output = await run({
			docs: [{ path: 'docs/a.md', content: '# A' }],
			skipped: [
				{ path: 'docs/huge.md', reason: 'too-large' },
				{ path: 'docs/locked.md', reason: 'unreadable' },
			],
			capped: true,
		});
		expect(output.coverage).toEqual({
			capped: true,
			maxDocs: LINK_CHECK_MAX_DOCS,
			skippedTotal: 2,
			skipped: [
				{ path: 'docs/huge.md', reason: 'too-large' },
				{ path: 'docs/locked.md', reason: 'unreadable' },
			],
		});
	});
});
