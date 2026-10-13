import { describe, expect, it } from 'vitest';

import { detectDipViolations } from '../../../../src/lib/scan/dip-violation';

describe('scan/dip-violation — detectDipViolations', () => {
	it('flags process.cwd() in a plugin source', () => {
		const body = 'export const path = process.cwd();';
		const hits = detectDipViolations(
			'plugins/example/src/lib/foo.ts',
			body,
		);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.kind).toBe('process-cwd');
	});

	it('does not flag a clean plugin', () => {
		const body = [
			"import { join } from 'node:path';",
			"import { readFile } from 'node:fs/promises';",
			'export const read = (p: string) => readFile(join(ctx.workspace, p));',
		].join('\n');
		const hits = detectDipViolations(
			'plugins/example/src/lib/foo.ts',
			body,
		);
		expect(hits).toHaveLength(0);
	});

	it('flags a sync readFileSync import in a plugin', () => {
		const body = [
			"import { readFileSync } from 'node:fs';",
			'export const read = (p: string) => readFileSync(p);',
		].join('\n');
		const hits = detectDipViolations(
			'plugins/example/src/lib/foo.ts',
			body,
		);
		expect(hits.some((h) => h.kind === 'sync-fs-import')).toBe(true);
	});

	it('does not flag paths outside plugin/core scope', () => {
		const body = 'export const path = process.cwd();';
		const hits = detectDipViolations('docs/some/notes.md', body);
		expect(hits).toHaveLength(0);
	});

	it('does not flag the boot-time configuration-center', () => {
		const body = [
			"import { readFileSync } from 'node:fs';",
			'export const cfg = readFileSync(bootPath);',
		].join('\n');
		const hits = detectDipViolations(
			'packages/core/src/lib/configuration-center/loader.ts',
			body,
		);
		expect(hits).toHaveLength(0);
	});

	it('does not flag the provider-model bridge, read by sync identity resolution', () => {
		// The bridge answers "who is working" for the git guard (a one-shot
		// process per hook), `work enter` and every ref-naming call site —
		// all synchronous by contract. What it reads is a small JSON entry
		// the provider rewrites every request.
		const body = [
			"import { existsSync, readFileSync } from 'node:fs';",
			'export const providerModelId = () => readFileSync(p);',
		].join('\n');
		const hits = detectDipViolations(
			'packages/core/src/lib/work-identity/provider-model-bridge.helper.ts',
			body,
		);
		expect(hits).toHaveLength(0);
	});

	it('exempts the records-folder resolver, synchronous by contract', () => {
		const body =
			"import { readFileSync } from 'node:fs';\nexport const x = () => readFileSync(p);";
		expect(
			detectDipViolations(
				'packages/core/src/lib/shared/delendai-records.ts',
				body,
			),
		).toHaveLength(0);
	});

	it("exempts the users' configuration roots, read by synchronous path resolvers", () => {
		const body =
			"import { readdirSync } from 'node:fs';\nexport const x = () => readdirSync(p);";
		expect(
			detectDipViolations(
				'packages/core/src/lib/platform/user-directories.helper.ts',
				body,
			),
		).toHaveLength(0);
	});

	it('exempts the editor and catalog readers the same identity resolution uses', () => {
		const body =
			"import { readFileSync } from 'node:fs';\nexport const x = () => readFileSync(p);";
		for (const path of [
			'packages/core/src/lib/work-identity/host-chat-model.helper.ts',
			'packages/core/src/lib/work-identity/model-identity.helper.ts',
		])
			expect(detectDipViolations(path, body)).toHaveLength(0);
	});
});
