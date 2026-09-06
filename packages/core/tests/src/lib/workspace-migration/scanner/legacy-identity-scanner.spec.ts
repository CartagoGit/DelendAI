import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	classifyLegacyIdentityHit,
	LEGACY_SCANNER_PATTERNS,
} from '@delendai/core/lib/workspace-migration/scanner/classification';
import { scanLegacyIdentity } from '@delendai/core/lib/workspace-migration/scanner/legacy-identity-scanner';

describe('legacy identity scanner (b00239 S8)', () => {
	it('covers the nine legacy patterns the proposal enumerates', () => {
		expect(LEGACY_SCANNER_PATTERNS.map((pattern) => pattern.label)).toEqual(
			[
				'@mcp-vertex',
				'MCP-VERTEX',
				'MCP_VERTEX',
				'MCP Vertex',
				'mcp_vertex',
				'mcpvertex',
				'mcp-vertex',
				'mcpv',
				'--mcp-vertex-*',
			],
		);
	});

	it('classifies LIVE, HISTORICAL, VENDORED and GENERATED hits', () => {
		expect(
			classifyLegacyIdentityHit({
				file: 'src/main.ts',
				text: 'run mcp-vertex doctor before release',
			}).classification,
		).toBe('live');
		expect(
			classifyLegacyIdentityHit({
				file: 'docs/wiki/migration.md',
				text: 'MCP Vertex 0.1.x used to write its cache here',
			}).classification,
		).toBe('historical');
		expect(
			classifyLegacyIdentityHit({
				file: 'node_modules/pkg/readme.md',
				text: 'install @mcp-vertex/cli',
			}).classification,
		).toBe('vendored');
		expect(
			classifyLegacyIdentityHit({
				file: 'src/generated/tool.generated.ts',
				text: 'const help = "mcpvertex"',
			}).classification,
		).toBe('generated');
	});

	it('fails the scan when a LIVE residual remains unresolved', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-s8-live-'));
		await writeFile(join(root, 'README.md'), 'install @mcp-vertex/cli\n');
		const result = await scanLegacyIdentity(root);
		expect(result.ok).toBe(false);
		expect(result.liveHits).toHaveLength(1);
		expect(result.liveHits[0]?.spelling).toBe('@mcp-vertex');
	});

	it('scans a workspace and classifies one hit per category', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-s8-scan-'));
		await mkdir(join(root, 'src'), { recursive: true });
		await mkdir(join(root, 'docs', 'wiki'), { recursive: true });
		await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
		await mkdir(join(root, 'src', 'generated'), { recursive: true });
		await writeFile(
			join(root, 'src', 'main.ts'),
			'argv.push("--mcp-vertex-home")\n',
		);
		await writeFile(
			join(root, 'docs', 'wiki', 'history.md'),
			'MCP Vertex 0.1.x used to store docs here.\n',
		);
		await writeFile(
			join(root, 'node_modules', 'pkg', 'README.md'),
			'install @mcp-vertex/cli\n',
		);
		await writeFile(
			join(root, 'src', 'generated', 'api.generated.ts'),
			'export const legacy = "mcpvertex"\n',
		);

		const result = await scanLegacyIdentity(root);
		expect(result.hits).toHaveLength(4);
		expect(result.hits.map((hit) => hit.classification).sort()).toEqual([
			'generated',
			'historical',
			'live',
			'vendored',
		]);
		expect(result.ok).toBe(false);
	});

	it('accepts extra historical segments for project-owned records', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-s8-history-'));
		await mkdir(join(root, 'proposals', 'done'), { recursive: true });
		await writeFile(
			join(root, 'proposals', 'done', 'f1.md'),
			'install @mcp-vertex/cli used to be the documented path\n',
		);
		const result = await scanLegacyIdentity(root, {
			extraHistoricalSegments: ['/proposals/done/'],
		});
		expect(result.ok).toBe(true);
		expect(result.hits[0]?.classification).toBe('historical');
	});
});
