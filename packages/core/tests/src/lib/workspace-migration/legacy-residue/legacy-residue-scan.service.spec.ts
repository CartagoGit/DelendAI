import { describe, expect, it } from 'vitest';

import type { ILegacyResidueIO } from '@delendai/core/lib/contracts/interfaces/legacy-residue.interface';
import {
	applyLegacyResidue,
	scanLegacyResidue,
	thisMachineResidueOptions,
} from '@delendai/core/lib/workspace-migration/legacy-residue/legacy-residue-scan.service';

const OLD = '{"mcpServers":{"mcp-vertex":{"command":"bun"}}}';

const optionsOver = (files: Map<string, string>) => {
	const io: ILegacyResidueIO = {
		readText: async (path) => files.get(path),
		writeText: async (path, text) => {
			files.set(path, text);
		},
	};
	return {
		...thisMachineResidueOptions('/w'),
		home: '/h',
		platform: 'linux' as const,
		windowsHomes: [],
		io,
	};
};

describe('the residue scan', () => {
	it('[<50ms] describes this machine', () => {
		const options = thisMachineResidueOptions('/w');
		expect(options.workspaceRoot).toBe('/w');
		expect(options.home).not.toBe('');
	});

	it('[<20ms] scans without writing and applies with a backup', async () => {
		const files = new Map([['/h/.claude.json', OLD]]);
		const scanned = await scanLegacyResidue(optionsOver(files));
		expect(scanned.changes).toHaveLength(1);
		expect(files.get('/h/.claude.json')).toBe(OLD);
		const applied = await applyLegacyResidue(optionsOver(files));
		expect(applied.lines).toHaveLength(1);
		expect(files.get('/h/.claude.json')).not.toContain('mcp-vertex');
		expect(files.size).toBe(2);
	});
});
