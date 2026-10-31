import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
	buildInventory,
	buildProposalInventory,
	checkEvidenceContract,
	computeConsensus,
} from '../../../../src/lib/services/audit-contract.service';
import {
	claimSeat,
	commitPhaseA,
	mayReadOthers,
} from '../../../../src/lib/services/audit-seats.service';
import type { IAuditDocument } from '../../../../src/lib/contracts/interfaces/audit.interface';

const doc = (detail: string): IAuditDocument => ({
	path: 'a.md',
	slug: 'a',
	source: { model: 'm', host: 'h', date: '' },
	summary: '',
	findings: [{ id: 'f1', title: 't', severity: 'BAD', files: [], detail }],
	scores: [],
	note: '',
});

describe('audit seats and Phase A', () => {
	let dir = '';
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'audit-seats-'));
		await writeFile(join(dir, 'mine.md'), '# mine');
	});

	it('refuses a second claim of the same seat', async () => {
		expect((await claimSeat(dir, 'seat-1', 'alice')).ok).toBe(true);
		const second = await claimSeat(dir, 'seat-1', 'bob');
		expect(second).toMatchObject({ ok: false });
		expect(JSON.stringify(second)).toContain('alice');
	});

	it('rejects names that are paths', async () => {
		expect((await claimSeat(dir, '../x', 'alice')).ok).toBe(false);
	});

	it('gates reading on a committed, unchanged Phase A file', async () => {
		expect((await mayReadOthers(dir, 'alice')).ok).toBe(false);
		expect((await commitPhaseA(dir, 'alice', 'mine.md')).ok).toBe(true);
		expect((await mayReadOthers(dir, 'alice')).ok).toBe(true);
		await writeFile(join(dir, 'mine.md'), '# edited');
		expect((await mayReadOthers(dir, 'alice')).ok).toBe(false);
	});

	it('refuses a Phase A file outside the audit dir', async () => {
		expect((await commitPhaseA(dir, 'alice', '../outside.md')).ok).toBe(
			false,
		);
	});
});

describe('audit contract, inventory and consensus', () => {
	it('lists the missing evidence fields and none when complete', () => {
		const partial = checkEvidenceContract([
			doc('Severidad: P1\nEstado: confirmado'),
		]);
		expect(partial[0]?.missing).toContain('component');
		expect(partial[0]?.missing).not.toContain('severity');
		const all = [
			'Severity',
			'State',
			'Component',
			'Location',
			'Reproduction',
			'Recommended fix',
			'Regression test',
			'Root cause',
			'Expected',
			'Actual',
			'Impact',
			'Evidence',
			'Snapshot',
			'Relation',
			'Confidence',
		]
			.map((l) => `${l}: x`)
			.join('\n');
		expect(checkEvidenceContract([doc(all)])).toEqual([]);
	});

	it('normalises the state of each finding', () => {
		expect(buildInventory([doc('Estado: confirmado')])[0]?.state).toBe(
			'confirmed',
		);
		expect(buildInventory([doc('nothing')])[0]?.state).toBe('open');
	});

	it('records ratio and threshold per finding', () => {
		const [c] = computeConsensus(
			{
				auditsFound: 4,
				skipped: [],
				consensus: [],
				topActions: [],
				findings: [
					{
						id: 'x',
						titles: [],
						worstSeverity: 'BAD',
						files: [],
						seenBy: ['a', 'b', 'c'],
					},
				],
			},
			4,
			0.5,
		);
		expect(c).toMatchObject({
			ratio: 0.75,
			threshold: 0.5,
			consensus: true,
		});
	});

	it('inventories the active proposals', async () => {
		const root = await mkdtemp(join(tmpdir(), 'audit-props-'));
		await mkdir(join(root, 'ready/feats'), { recursive: true });
		await mkdir(join(root, 'done'), { recursive: true });
		await writeFile(
			join(root, 'ready/feats/f1.md'),
			'---\nid: f1\ntitle: "T"\n---\n',
		);
		await writeFile(join(root, 'done/f2.md'), '---\nid: f2\n---\n');
		expect(await buildProposalInventory(root)).toEqual([
			{ id: 'f1', status: 'ready', title: 'T' },
		]);
	});
});
