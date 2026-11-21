/**
 * quota-ledger.helper.spec.ts — one ledger for the machine, and a
 * workspace's own ledger from before moved into it once, journalled.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { QUOTA_LEDGER_VARIABLE } from '../../../../src/lib/contracts/constants/quota-ledger.constant';
import {
	adoptWorkspaceLedger,
	machineLedgerPath,
} from '../../../../src/lib/services/quota-ledger.helper';

const SCHEMA = 'delendai/orchestrator-runner/quota-reservations/1';
const NOW = Date.parse('2026-10-27T12:00:00.000Z');

const ledger = (reservations: unknown[], history: unknown[] = []) =>
	`${JSON.stringify({ schema: SCHEMA, reservations, history })}\n`;

const reservation = (invocationId: string, expiresAt: string) => ({
	invocationId,
	groups: ['g'],
	expiresAt,
});

describe('machineLedgerPath', () => {
	it('is in the user cache unless the variable says otherwise', () => {
		expect(machineLedgerPath({}).startsWith(homedir())).toBe(true);
		expect(
			machineLedgerPath({ [QUOTA_LEDGER_VARIABLE]: '/x/ledger.json' }),
		).toBe('/x/ledger.json');
	});
});

describe('adoptWorkspaceLedger', () => {
	const paths = () => {
		const root = mkdtempSync(join(tmpdir(), 'quota-adopt-'));
		return {
			workspaceLedger: join(root, 'ws', 'quota-reservations.json'),
			machineLedger: join(root, 'machine', 'ledger.json'),
			journal: join(root, 'ws', 'migrations.jsonl'),
			root,
		};
	};

	it('moves live reservations and history in once, and journals it', async () => {
		const at = paths();
		mkdirSync(join(at.root, 'ws'), { recursive: true });
		mkdirSync(join(at.root, 'machine'), { recursive: true });
		writeFileSync(
			at.workspaceLedger,
			ledger(
				[
					reservation('live', '2026-10-27T13:00:00.000Z'),
					reservation('gone', '2026-10-27T11:00:00.000Z'),
					reservation('both', '2026-10-27T13:00:00.000Z'),
				],
				[
					{
						invocationId: 'live',
						groups: ['g'],
						at: '2026-10-27T11:59:00.000Z',
					},
				],
			),
		);
		writeFileSync(
			at.machineLedger,
			ledger([reservation('both', '2026-10-27T13:00:00.000Z')]),
		);
		expect(await adoptWorkspaceLedger({ ...at, now: () => NOW })).toBe(
			'adopted',
		);
		const machine = JSON.parse(readFileSync(at.machineLedger, 'utf8'));
		expect(
			machine.reservations.map(
				(each: { invocationId: string }) => each.invocationId,
			),
		).toEqual(['both', 'live']);
		expect(machine.history).toHaveLength(1);
		expect(existsSync(at.workspaceLedger)).toBe(false);
		expect(readFileSync(at.journal, 'utf8')).toContain(
			'quota-ledger.adopted',
		);
		expect(await adoptWorkspaceLedger({ ...at, now: () => NOW })).toBe(
			'none',
		);
	});

	it('leaves a workspace ledger it cannot read where it is', async () => {
		const at = paths();
		mkdirSync(join(at.root, 'ws'), { recursive: true });
		writeFileSync(at.workspaceLedger, '{torn');
		expect(await adoptWorkspaceLedger(at)).toBe('unreadable');
		expect(readFileSync(at.workspaceLedger, 'utf8')).toBe('{torn');
	});
});
