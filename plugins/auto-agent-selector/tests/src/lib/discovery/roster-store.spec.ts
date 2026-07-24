import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { realRosterSnapshotStore } from '../../../../src/lib/discovery/roster-store';

const tmp = (): string => mkdtempSync(join(tmpdir(), 'aas-roster-'));

describe('realRosterSnapshotStore', () => {
	it('writes an atomic, redacted snapshot that contains provider metadata only', async () => {
		const path = join(tmp(), 'nested', 'roster.json');
		const store = realRosterSnapshotStore(path, 8);
		await store.save({
			available: [
				{
					id: 'openai-api',
					label: 'OpenAI API',
					source: 'api',
					vendor: 'openai',
					reach: 'OPENAI_API_KEY',
					costTier: 3,
				},
			],
			missing: [],
		});
		const snapshot = await readFile(path, 'utf8');
		expect(snapshot).toContain('mcp-vertex/auto-agent-selector/roster/1');
		expect(snapshot).toContain('"defaultCostQualityTradeoff": 8');
		expect(snapshot).toContain('OPENAI_API_KEY');
		expect(snapshot).not.toContain('sk-');
	});
});
