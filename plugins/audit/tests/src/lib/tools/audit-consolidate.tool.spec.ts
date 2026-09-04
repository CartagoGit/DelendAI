/**
 * l00008 s3 — `audit_consolidate`'s `auditDir` resolved with bare
 * `path.resolve(workspaceRoot, relDir)` (no containment), so a caller
 * could pass `..`/absolute paths and read files outside the workspace.
 * This spec pins the fix: `resolveWorkspaceContained` rejects escapes
 * before any `readdir`/`readFile` happens.
 */
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildConsolidateRegistration } from '../../../../src/lib/tools/audit-consolidate.tool';

const peerPlugins = {
	list: () => ['audit', 'proposals'],
	has: (name: string) => name === 'audit' || name === 'proposals',
} as never;

const invoke = async (
	reg: ReturnType<typeof buildConsolidateRegistration>,
	args: unknown,
): Promise<{ content: Array<{ text: string }> }> => {
	let handler:
		| ((a: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	await reg.register({
		registerTool: (
			_name: string,
			_desc: unknown,
			fn: typeof handler,
		): void => {
			handler = fn;
		},
	} as never);
	if (!handler)
		throw new Error('audit_consolidate did not register a handler');
	return handler(args);
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('audit_consolidate auditDir containment (l00008 s3)', async () => {
	let workspaceRoot = '';

	beforeEach(async () => {
		workspaceRoot = await mkdtemp(join(tmpdir(), 'audit-consolidate-'));
		// A real, in-workspace audits dir with one valid audit file so the
		// happy-path case has something to consolidate.
		const auditsDir = join(
			workspaceRoot,
			'docs',
			'delendai',
			'proposals',
			'done',
			'audits',
		);
		await mkdir(auditsDir, { recursive: true });
		await writeFile(
			join(auditsDir, 'sample.md'),
			[
				'# Audit',
				'',
				'## 🔴 FATAL',
				'',
				'### 1. Contained proposal fixture',
				'**Fichero**: `src/example.ts`',
				'',
				'## Scoreboard',
				'',
				'| Dimension | Score |',
				'|---|---|',
				'| Calidad | 8 |',
				'',
			].join('\n'),
			'utf8',
		);
		// A directory outside the workspace, to prove escape attempts are
		// rejected before ever touching it.
		await mkdir(join(workspaceRoot, '..', 'outside-fixture'), {
			recursive: true,
		}).catch(() => undefined);
	});

	afterEach(async () => {
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(join(workspaceRoot, '..', 'outside-fixture'), {
			recursive: true,
			force: true,
		}).catch(() => undefined);
	});

	const buildReg = () =>
		buildConsolidateRegistration({
			namespacePrefix: 'audit',
			workspaceRoot,
			defaultAuditDir: 'docs/delendai/proposals/done/audits',
			peerPlugins,
		});

	it('accepts a normal relative path inside the workspace', async () => {
		const out = parse(
			await invoke(buildReg(), {
				auditDir: 'docs/delendai/proposals/done/audits',
			}),
		);
		expect(out.detail).toBe('normal');
		expect(out.auditsFound).toBe(1);
	});

	it('supports compact detail by trimming consensus, findings and markdown', async () => {
		const out = parse(
			await invoke(buildReg(), {
				auditDir: 'docs/delendai/proposals/done/audits',
				detail: 'compact',
			}),
		);
		expect(out.detail).toBe('compact');
		expect(out.consensus).toEqual([]);
		expect(out.findings).toEqual([]);
		expect(out.markdown).toBe('');
		expect(out.topActions.length).toBeGreaterThan(0);
	});

	it('rejects a "../" escape attempt', async () => {
		const out = parse(
			await invoke(buildReg(), { auditDir: '../outside-fixture' }),
		);
		expect(JSON.stringify(out)).toContain('not allowed');
	});

	it('rejects an absolute path outside the workspace', async () => {
		const out = parse(await invoke(buildReg(), { auditDir: '/etc' }));
		expect(JSON.stringify(out)).toContain('not allowed');
	});

	it('rejects a deep "../" escape that would otherwise resolve outside the workspace', async () => {
		const out = parse(
			await invoke(buildReg(), {
				auditDir:
					'docs/delendai/proposals/done/audits/../../../../../../outside-fixture',
			}),
		);
		// Either rejected by containment (escape) or surfaced as a read
		// error — both confirm it never silently reads workspace-external
		// content. The containment check runs first in the implementation.
		expect(out.auditsFound).toBeUndefined();
	});

	it('rejects an absolute proposalsDir without writing outside the workspace', async () => {
		const outside = join(workspaceRoot, '..', 'outside-fixture');
		const out = parse(
			await invoke(buildReg(), {
				proposalsDir: outside,
				autoScaffoldProposals: true,
			}),
		);
		expect(out.proposals).toEqual({
			skipped: 'proposals-dir-out-of-workspace',
		});
		expect(await readdir(outside)).toEqual([]);
	});

	it('rejects a proposalsDir traversal without writing outside the workspace', async () => {
		const outside = join(workspaceRoot, '..', 'outside-fixture');
		const out = parse(
			await invoke(buildReg(), {
				proposalsDir: '../outside-fixture',
				autoScaffoldProposals: true,
			}),
		);
		expect(out.proposals).toEqual({
			skipped: 'proposals-dir-out-of-workspace',
		});
		expect(await readdir(outside)).toEqual([]);
	});

	it('scaffolds into a valid workspace-relative proposalsDir', async () => {
		const proposalsDir = 'generated/proposals';
		const out = parse(
			await invoke(buildReg(), {
				proposalsDir,
				autoScaffoldProposals: true,
			}),
		);
		expect(out.proposals.scaffolded).toHaveLength(3);
		expect(out.proposals.scaffolded[0]?.id).toMatch(/^a\d{5}$/u);
		expect(out.proposals.scaffolded[1]?.id).toMatch(/^q\d{5}$/u);
		expect(out.proposals.scaffolded[2]?.id).toMatch(/^x\d{5}$/u);
		const written = await readdir(join(workspaceRoot, proposalsDir));
		expect(written.sort()).toEqual(['audits', 'fixes', 'plans']);
		const nestedCounts = await Promise.all(
			written.map(
				async (entry) =>
					(
						await readdir(join(workspaceRoot, proposalsDir, entry))
					).filter((name) => name.endsWith('.md')).length,
			),
		);
		expect(nestedCounts.reduce((sum, count) => sum + count, 0)).toBe(3);
	});
});
