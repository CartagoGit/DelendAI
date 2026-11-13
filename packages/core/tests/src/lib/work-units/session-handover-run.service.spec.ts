import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	SESSION_HANDOVER_COMMAND,
	SESSION_HANDOVER_INDEX_MAX_BYTES,
} from '../../../../src/lib/contracts/constants/session-handover-command.constant';
import { AGENT_HOSTS } from '../../../../src/lib/contracts/constants/agent-hosts.constant';
import { renderCompactionFor } from '../../../../src/lib/hosts/compaction-policy.helper';
import { runSessionHandover } from '../../../../src/lib/work-units/session-handover-run.service';
import type { ISessionHandoverSources } from '../../../../src/lib/work-units/session-handover.interface';

let root = '';
afterEach(() => rmSync(root, { recursive: true, force: true }));

const many = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		id: `unit-${String(index)}-${'x'.repeat(40)}`,
		summary: '\u00e9'.repeat(200),
		source: `refs/heads/${'y'.repeat(60)}`,
	}));

describe('runSessionHandover', () => {
	it('[<100ms] persists from the sources, then index and show read it back', async () => {
		root = mkdtempSync(join(tmpdir(), 'handover-'));
		const sources: ISessionHandoverSources = {
			units: async () => [
				{ id: 'u1', summary: 'one unit', source: 'ref' },
			],
		};
		const persisted = await runSessionHandover({
			root,
			action: 'persist',
			sources,
			now: 1,
		});
		expect(persisted.text).toContain('1 entries');
		const index = await runSessionHandover({
			root,
			action: 'index',
			now: 2,
			sources: {},
		});
		expect(index.text).toContain('u1: one unit [ref]');
		expect(index.text).toContain('(missing: no store answers it)');
		const shown = await runSessionHandover({
			root,
			action: 'show',
			entry: 'u1',
			sources: {},
		});
		expect(shown).toMatchObject({ ok: true });
		expect(shown.text).toContain('source: ref');
		const absent = await runSessionHandover({
			root,
			action: 'show',
			entry: 'nope',
			sources: {},
		});
		expect(absent.ok).toBe(false);
	});

	it('[<100ms] keeps the index within the byte budget however large the entries are', async () => {
		root = mkdtempSync(join(tmpdir(), 'handover-'));
		const sources: ISessionHandoverSources = {
			units: async () => many(20),
			decisions: async () => many(20),
			pending: async () => many(20),
			done: async () => many(20),
			branches: async () => many(20),
			commits: async () => many(20),
			pullRequests: async () => many(20),
			evidence: async () => many(20),
			tests: async () => many(20),
			errors: async () => many(20),
			blockers: async () => many(20),
			invariants: async () => many(20),
		};
		const index = await runSessionHandover({
			root,
			action: 'index',
			sources,
		});
		expect(Buffer.byteLength(index.text, 'utf8')).toBeLessThanOrEqual(
			SESSION_HANDOVER_INDEX_MAX_BYTES,
		);
		expect(index.text).toContain('left out');
	});

	it('[<20ms] names the command the host renderers run', () => {
		const claude = AGENT_HOSTS.find((host) => host.id === 'claude');
		if (claude === undefined) throw new Error('claude host missing');
		const rendered = renderCompactionFor(claude, {
			thresholdPercent: 40,
			handoverCommand: SESSION_HANDOVER_COMMAND,
		});
		expect(rendered).toMatchObject({
			hooks: [
				{ command: 'delendai session handover persist' },
				{ command: 'delendai session handover index' },
			],
		});
	});
});
