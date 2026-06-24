/**
 * l00008 s3 — `audit_consolidate`'s `auditDir` resolved with bare
 * `path.resolve(workspaceRoot, relDir)` (no containment), so a caller
 * could pass `..`/absolute paths and read files outside the workspace.
 * This spec pins the fix: `resolveWorkspaceContained` rejects escapes
 * before any `readdir`/`readFile` happens.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildConsolidateRegistration } from '../../../../src/lib/tools/audit-consolidate.tool';

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
		const auditsDir = join(workspaceRoot, 'docs', 'proposals', 'audits');
		await mkdir(auditsDir, { recursive: true });
		await writeFile(
			join(auditsDir, 'sample.md'),
			[
				'# Audit',
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
			defaultAuditDir: 'docs/proposals/audits',
		});

	it('accepts a normal relative path inside the workspace', async () => {
		const out = parse(
			await invoke(buildReg(), { auditDir: 'docs/proposals/audits' }),
		);
		expect(out.auditsFound).toBe(1);
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
				auditDir: 'docs/proposals/audits/../../../../outside-fixture',
			}),
		);
		// Either rejected by containment (escape) or surfaced as a read
		// error — both confirm it never silently reads workspace-external
		// content. The containment check runs first in the implementation.
		expect(out.auditsFound).toBeUndefined();
	});
});
