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
	it('covers the eight legacy patterns the proposal enumerates', () => {
		expect(LEGACY_SCANNER_PATTERNS.map((pattern) => pattern.label)).toEqual(
			[
				'delendai',
				'delendai',
				'delendai',
				'DelendAI',
				'DELENDAI',
				'@delendai',
				'delendai',
				'--mcp-vertex-*',
			],
		);
	});

	it('classifies LIVE, HISTORICAL, VENDORED and GENERATED hits', () => {
		expect(
			classifyLegacyIdentityHit({
				file: 'src/main.ts',
				text: 'run delendai doctor before release',
			}).classification,
		).toBe('live');
		expect(
			classifyLegacyIdentityHit({
				file: 'docs/wiki/migration.md',
				text: 'DelendAI 0.1.x used to write its cache here',
			}).classification,
		).toBe('historical');
		expect(
			classifyLegacyIdentityHit({
				file: 'node_modules/pkg/readme.md',
				text: 'install @delendai/cli',
			}).classification,
		).toBe('vendored');
		expect(
			classifyLegacyIdentityHit({
				file: 'src/generated/tool.generated.ts',
				text: 'const help = "delendai"',
			}).classification,
		).toBe('generated');
	});

	it('fails the scan when a LIVE residual remains unresolved', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-s8-live-'));
		await writeFile(join(root, 'README.md'), 'install @delendai/cli\n');
		const result = await scanLegacyIdentity(root);
		expect(result.ok).toBe(false);
		expect(result.liveHits.length).toBeGreaterThan(0);
		expect(result.liveHits.map((hit) => hit.spelling)).toContain(
			'@delendai',
		);
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
			'DelendAI 0.1.x used to store docs under docs/delendai.\n',
		);
		await writeFile(
			join(root, 'node_modules', 'pkg', 'README.md'),
			'install @delendai/cli\n',
		);
		await writeFile(
			join(root, 'src', 'generated', 'api.generated.ts'),
			'export const legacy = "delendai"\n',
		);

		const result = await scanLegacyIdentity(root);
		expect(result.hits).toHaveLength(6);
		expect(result.hits.map((hit) => hit.classification).sort()).toEqual([
			'generated',
			'historical',
			'historical',
			'live',
			'vendored',
			'vendored',
		]);
		expect(result.ok).toBe(false);
	});

	it('accepts extra historical segments for project-owned records', async () => {
		const root = await mkdtemp(join(tmpdir(), 'delendai-s8-history-'));
		await mkdir(join(root, 'proposals', 'done'), { recursive: true });
		await writeFile(
			join(root, 'proposals', 'done', 'f1.md'),
			'install @delendai/cli used to be the documented path\n',
		);
		const result = await scanLegacyIdentity(root, {
			extraHistoricalSegments: ['/proposals/done/'],
		});
		expect(result.ok).toBe(true);
		expect(result.hits[0]?.classification).toBe('historical');
	});
});
