/**
 * legacy-identity.contract.spec.ts — b00239 S2/S8.
 *
 * The classification is the part of the rebrand most likely to go wrong
 * quietly, because both of its mistakes look like success. Calling a live
 * reference "historical" ships a broken instruction and reports zero
 * remaining work; calling history "live" invites someone to rewrite a true
 * sentence about the past.
 *
 * These tests pin the asymmetry: unknown means live.
 */
import { describe, expect, it } from 'vitest';

import { LEGACY_IDENTITY_SPELLINGS } from '@mcp-vertex/core/lib/contracts/constants/legacy-identity.constant';
import { classifyResidual } from '@mcp-vertex/core/lib/workspace-migration/classify-residual.service';

describe('legacy identity spellings', () => {
	it('carries every spelling the scanner and the migrators both need', () => {
		// One list, two consumers. A rename where the migrator and the
		// scanner disagree about what the old name looks like reports
		// itself complete while leaving live references behind.
		expect([...LEGACY_IDENTITY_SPELLINGS]).toEqual([
			'mcp-vertex',
			'mcp_vertex',
			'mcpvertex',
			'MCP Vertex',
			'MCP-VERTEX',
			'@mcp-vertex',
			'mcpv',
		]);
	});
});

describe('classifyResidual', () => {
	it('treats anything it cannot place as live', () => {
		// The asymmetry that matters. A hit wrongly called live costs
		// somebody a look; one wrongly called historical is a broken
		// reference that ships while the migration reports success.
		const verdict = classifyResidual('src/lib/some-service.ts');
		expect(verdict.classification).toBe('live');
	});

	it('recognises a closed proposal as history, not as work', () => {
		const verdict = classifyResidual(
			'docs/mcp-vertex/proposals/done/fixes/x00001-something.md',
		);
		expect(verdict.classification).toBe('historical');
		expect(verdict.reason).toContain('falsify the record');
	});

	it('recognises audits and changelogs as history', () => {
		for (const file of [
			'docs/mcp-vertex/audits/a00001-report.md',
			'CHANGELOG.md',
			'docs/mcp-vertex/wiki/hosts.md',
		])
			expect(classifyResidual(file).classification).toBe('historical');
	});

	it('leaves vendored trees alone', () => {
		for (const file of [
			'node_modules/some-pkg/index.js',
			'vendor/lib/thing.ts',
			'third-party/x.ts',
		])
			expect(classifyResidual(file).classification).toBe('vendored');
	});

	it('sends generated artefacts back to their source', () => {
		for (const file of [
			'packages/core/src/lib/catalog.generated.ts',
			'packages/core/src/lib/generated/index.ts',
			'packages/core/src/lib/thing.d.ts',
		]) {
			const verdict = classifyResidual(file);
			expect(verdict.classification).toBe('generated');
			expect(verdict.reason).toContain('regenerate');
		}
	});

	it('prefers vendored over generated for a generated file inside node_modules', () => {
		// Order matters: a `.d.ts` under `node_modules` is somebody else's
		// build output. "Regenerate it from its source" would be advice
		// about a source we do not have.
		expect(
			classifyResidual('node_modules/pkg/dist/index.d.ts').classification,
		).toBe('vendored');
	});

	it('does not treat an open proposal as history', () => {
		// `proposals/ready/` is a plan for work not yet done, so an
		// instruction inside it is live: following it today would install
		// the old identity.
		expect(
			classifyResidual('docs/mcp-vertex/proposals/ready/feats/f1.md')
				.classification,
		).toBe('live');
	});

	it('normalises a leading slash so both path shapes classify alike', () => {
		expect(classifyResidual('/node_modules/x/y.js').classification).toBe(
			'vendored',
		);
	});
});
