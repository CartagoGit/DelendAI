import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { IFinding } from '@delendai/core/public';
import { afterEach, describe, expect, it } from 'vitest';

import type { IBacklog } from '../../../../src/lib/contracts/interfaces/backlog.interface';
import {
	fileProposalsFromBacklog,
	type IProposalDraft,
} from '../../../../src/lib/self-audit/file-proposals';

const tempDirs: string[] = [];

const finding = (
	ruleId: string,
	severity: IFinding['severity'],
	message = ruleId,
	overrides: Partial<IFinding> = {},
): IFinding => ({
	ruleId,
	severity,
	message,
	...overrides,
});

const backlogFrom = (...findings: readonly IFinding[]): IBacklog =>
	findings.map((entry, index) => ({
		finding: entry,
		score: 100 - index,
		rationale: `rationale-${index + 1}`,
		rank: index + 1,
	}));

const tempDir = async (): Promise<string> => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'audit-file-proposals-'));
	tempDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) =>
			rm(dir, {
				recursive: true,
				force: true,
			}),
		),
	);
});

describe('fileProposalsFromBacklog', () => {
	it('returns zero writes when consent is false', async () => {
		const proposalsDirAbs = await tempDir();
		const writes: IProposalDraft[] = [];

		const result = await fileProposalsFromBacklog({
			backlog: backlogFrom(finding('rule-a', 'high', 'First finding')),
			proposalsDirAbs,
			consent: false,
			writeProposal: async (draft) => {
				writes.push(draft);
				return draft.absPath;
			},
			now: () => '2026-07-26T00:00:00.000Z',
		});

		expect(result).toEqual({
			filed: 0,
			skipped: 1,
			drafts: [],
			ranAt: '2026-07-26T00:00:00.000Z',
		});
		expect(writes).toEqual([]);
	});

	it('returns an empty result for an empty backlog', async () => {
		const result = await fileProposalsFromBacklog({
			backlog: [],
			proposalsDirAbs: await tempDir(),
			consent: true,
			now: () => '2026-07-26T00:00:00.000Z',
		});

		expect(result).toEqual({
			filed: 0,
			skipped: 0,
			drafts: [],
			ranAt: '2026-07-26T00:00:00.000Z',
		});
	});

	it('writes one consented draft to disk with the expected body shape', async () => {
		const proposalsDirAbs = await tempDir();
		const [entry] = backlogFrom(
			finding('cve-2026-0001', 'high', 'Rotate leaked token', {
				location: { file: 'src/app.ts', line: 14 },
			}),
		);

		const result = await fileProposalsFromBacklog({
			backlog: [entry!],
			proposalsDirAbs,
			consent: true,
			now: () => '2026-07-26T00:00:00.000Z',
		});

		expect(result.filed).toBe(1);
		expect(result.skipped).toBe(0);
		const fileBody = await readFile(result.drafts[0]!.absPath, 'utf8');
		expect(fileBody.startsWith('---\n')).toBe(true);
		expect(fileBody).toContain(`id: ${result.drafts[0]!.proposalId}`);
		expect(fileBody).toContain('kind: fix');
		expect(fileBody).toContain('cve-2026-0001');
		expect(fileBody).toContain(
			'- Triage this finding and define a fix; see the source finding in the audit backlog.',
		);
	});

	it('honours the filing limit and counts the rest as skipped', async () => {
		const result = await fileProposalsFromBacklog({
			backlog: backlogFrom(
				finding('rule-a', 'critical', 'First finding'),
				finding('rule-b', 'high', 'Second finding'),
				finding('rule-c', 'medium', 'Third finding'),
			),
			proposalsDirAbs: await tempDir(),
			consent: true,
			limit: 1,
			now: () => '2026-07-26T00:00:00.000Z',
		});

		expect(result.filed).toBe(1);
		expect(result.skipped).toBe(2);
		expect(result.drafts).toHaveLength(1);
	});

	it('skips identical reruns when the same proposal file already exists', async () => {
		const proposalsDirAbs = await tempDir();
		const backlog = backlogFrom(
			finding('rule-a', 'high', 'Repeatable finding', {
				location: { file: 'src/repeat.ts' },
			}),
		);

		const first = await fileProposalsFromBacklog({
			backlog,
			proposalsDirAbs,
			consent: true,
			now: () => '2026-07-26T00:00:00.000Z',
		});
		const second = await fileProposalsFromBacklog({
			backlog,
			proposalsDirAbs,
			consent: true,
			now: () => '2026-07-26T00:00:00.000Z',
		});

		expect(first.filed).toBe(1);
		expect(second).toEqual({
			filed: 0,
			skipped: 1,
			drafts: [],
			ranAt: '2026-07-26T00:00:00.000Z',
		});
		expect(await readdir(path.join(proposalsDirAbs, 'ready'))).toHaveLength(
			1,
		);
	});

	it('uses a stable proposalId for the same finding across runs', async () => {
		const backlog = backlogFrom(
			finding('stable-rule', 'medium', 'Stable finding message'),
		);

		const first = await fileProposalsFromBacklog({
			backlog,
			proposalsDirAbs: await tempDir(),
			consent: true,
			now: () => '2026-07-26T00:00:00.000Z',
		});
		const second = await fileProposalsFromBacklog({
			backlog,
			proposalsDirAbs: await tempDir(),
			consent: true,
			now: () => '2026-07-26T00:00:00.000Z',
		});

		expect(first.drafts[0]?.proposalId).toBe(second.drafts[0]?.proposalId);
	});

	it('passes the top-N drafts to an injected writer in backlog order', async () => {
		const recorded: IProposalDraft[] = [];
		const proposalsDirAbs = await tempDir();

		const result = await fileProposalsFromBacklog({
			backlog: backlogFrom(
				finding('rule-a', 'critical', 'First finding'),
				finding('rule-b', 'high', 'Second finding'),
				finding('rule-c', 'medium', 'Third finding'),
			),
			proposalsDirAbs,
			consent: true,
			limit: 2,
			writeProposal: async (draft) => {
				recorded.push(draft);
				return draft.absPath;
			},
			now: () => '2026-07-26T00:00:00.000Z',
		});

		expect(recorded.map((draft) => draft.finding.ruleId)).toEqual([
			'rule-a',
			'rule-b',
		]);
		expect(result.drafts.map((draft) => draft.rank)).toEqual([1, 2]);
		expect(result.skipped).toBe(1);
	});
});
