import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCloseRegistration } from '../../../../src/lib/tools/audit-close.tool';
import { buildConsolidateRegistration } from '../../../../src/lib/tools/audit-consolidate.tool';

const AUDITS = 'docs/delendai/proposals/done/audits';

const handlerOf = async (
	reg: ReturnType<typeof buildCloseRegistration>,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let handler:
		| ((a: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof handler): void => {
			handler = fn;
		},
	} as never);
	if (!handler) throw new Error('no handler');
	return handler;
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('audit_close and the Phase A gate (f00789)', () => {
	let root = '';
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'audit-close-'));
		await mkdir(join(root, AUDITS), { recursive: true });
		await mkdir(join(root, 'docs/delendai/proposals/ready'), {
			recursive: true,
		});
		await writeFile(
			join(root, 'docs/delendai/proposals/ready/p.md'),
			'---\nid: f1\ntitle: "T"\n---\n',
		);
		await writeFile(
			join(root, AUDITS, '01-01-2026- Host (Alice).md'),
			'# Audit\n\n## FATAL\n\n### 1. Broken thing\n**File**: `src/a.ts`\nSeverity: P1\n\n## Scoreboard\n\n| Dimension | Score |\n|---|---|\n| Quality | 8 |\n',
		);
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const close = async (): Promise<(a: unknown) => Promise<any>> => {
		const h = await handlerOf(
			buildCloseRegistration({
				namespacePrefix: 'd',
				workspaceRoot: root,
				defaultAuditDir: AUDITS,
				proposalsRoot: 'docs/delendai/proposals',
			}),
		);
		return async (a) => parse(await h(a));
	};

	it('claims seats once and rejects a second seat for one reviewer', async () => {
		const call = await close();
		expect(
			(
				await call({
					action: 'claim-seat',
					reviewer: 'alice',
					seat: 's1',
				})
			).ok,
		).toBe(true);
		expect(
			(await call({ action: 'claim-seat', reviewer: 'bob', seat: 's1' }))
				.ok,
		).toBe(false);
		expect(
			(
				await call({
					action: 'claim-seat',
					reviewer: 'alice',
					seat: 's2',
				})
			).ok,
		).toBe(false);
		expect((await call({ action: 'claim-seat', reviewer: 'bob' })).ok).toBe(
			false,
		);
	});

	it('refuses to close until Phase A is committed, then records the consensus', async () => {
		const call = await close();
		await call({ action: 'claim-seat', reviewer: 'alice', seat: 's1' });
		const open = await call({ action: 'close' });
		expect(open).toMatchObject({ closed: false, pendingPhaseA: ['alice'] });
		expect(
			(await call({ action: 'commit-phase-a', reviewer: 'alice' })).ok,
		).toBe(false);
		const commit = await call({
			action: 'commit-phase-a',
			reviewer: 'alice',
			file: '01-01-2026- Host (Alice).md',
		});
		expect(commit.ok).toBe(true);
		expect(
			(
				await call({
					action: 'commit-phase-a',
					reviewer: 'alice',
					file: 'x.md',
				})
			).ok,
		).toBe(false);
		const done = await call({ action: 'close', threshold: 0.4 });
		expect(done.closed).toBe(true);
		expect(done.incomplete[0].missing).toContain('component');
		expect(done.inventoryMarkdown).toContain('| f1 | ready | T |');
		const record = JSON.parse(
			await readFile(join(root, AUDITS, '.audit/closure.json'), 'utf8'),
		);
		expect(record.threshold).toBe(0.4);
	});

	it('rejects a non-canonical audit dir', async () => {
		const call = await close();
		const out = await call({ action: 'close', auditDir: 'docs' });
		expect(JSON.stringify(out)).toContain('not canonical');
	});

	it('audit_consolidate reads the others only after the reviewer committed Phase A', async () => {
		const call = await close();
		const reg = buildConsolidateRegistration({
			namespacePrefix: 'd',
			workspaceRoot: root,
			defaultAuditDir: AUDITS,
			autoScaffoldProposals: false,
		});
		let h:
			| ((a: unknown) => Promise<{ content: Array<{ text: string }> }>)
			| undefined;
		await reg.register({
			registerTool: (_n: string, _d: unknown, fn: typeof h): void => {
				h = fn;
			},
		} as never);
		const blocked = await h!({ reviewer: 'alice' });
		expect(JSON.stringify(blocked)).toContain('Phase A');
		await call({
			action: 'commit-phase-a',
			reviewer: 'alice',
			file: '01-01-2026- Host (Alice).md',
		});
		const ok = parse(await h!({ reviewer: 'alice' }));
		expect(ok.auditsFound).toBe(1);
	});
});
