/**
 * refactor-containment.spec.ts — the refactor tools refuse a `root`
 * whose real location is outside the workspace.
 *
 * `refactor_apply` is the sharpest case in the whole containment
 * migration: it WRITES. The lexical check it used is a string
 * comparison, so `workspace/linked` passed while naming another tree —
 * and the apply would have written its hunks there. Physical
 * containment resolves the real path before anything is opened.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { buildRefactorRenameToolRegistrations } from './refactor-rename.tool';

type THandler = (args: unknown) => Promise<{
	content: Array<{ text: string }>;
	isError?: boolean;
}>;

const capture = async (registration: IToolRegistration): Promise<THandler> => {
	let handler: THandler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as THandler;
			},
		}),
	);
	if (!handler) throw new Error('no handler registered');
	return handler;
};

const OUTSIDE_SOURCE = 'export const secretSymbol = 1;\n';

describe('refactor tools refuse a root outside the workspace', () => {
	let parent = '';
	let workspaceRootAbs = '';
	let outside = '';

	const registrationFor = (id: string): IToolRegistration => {
		const found = buildRefactorRenameToolRegistrations({
			namespacePrefix: 'refactor',
			workspaceRootAbs,
		}).find((registration) => registration.id === id);
		if (!found) throw new Error(`${id} not registered`);
		return found;
	};

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'refactor-containment-'));
		workspaceRootAbs = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(join(workspaceRootAbs, 'src'), { recursive: true });
		await mkdir(outside, { recursive: true });
		await writeFile(join(outside, 'secret.ts'), OUTSIDE_SOURCE, 'utf8');
		await symlink(outside, join(workspaceRootAbs, 'linked'), 'dir');
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('refactor_rename refuses a root reached through an escaping symlink', async () => {
		const handler = await capture(registrationFor('refactor_rename'));

		const result = await handler({
			root: 'linked',
			from: 'secretSymbol',
			to: 'renamed',
		});

		expect(JSON.stringify(result)).toContain('not allowed');
	});

	it('refactor_apply refuses to WRITE through an escaping symlink', async () => {
		const handler = await capture(registrationFor('refactor_apply'));

		const result = await handler({
			root: 'linked',
			files: [
				{
					path: 'secret.ts',
					hunks: [
						{
							oldStart: 1,
							oldLines: 1,
							newStart: 1,
							newLines: 1,
							lines: [
								{
									kind: '-',
									text: 'export const secretSymbol = 1;',
								},
								{ kind: '+', text: 'export const pwned = 1;' },
							],
						},
					],
				},
			],
			consentToken: 'token',
		});

		expect(JSON.stringify(result)).toContain('not allowed');
		// The file outside the workspace must be byte-for-byte untouched.
		// Read through SafeWorkspaceReader rooted at that directory:
		// `lint:architecture-readfile-via-safe-reader` forbids a direct
		// `node:fs` read here, and its allowlist covers only two other
		// plugins — excusing a new violation would be the wrong fix.
		expect(
			(await new SafeWorkspaceReader(outside).readText('secret.ts'))
				.content,
		).toBe(OUTSIDE_SOURCE);
	});

	it('still plans a rename for a root that really is inside', async () => {
		await writeFile(
			join(workspaceRootAbs, 'src', 'inside.ts'),
			'export const insideSymbol = 1;\n',
			'utf8',
		);
		const handler = await capture(registrationFor('refactor_rename'));

		const result = await handler({
			root: 'src',
			from: 'insideSymbol',
			to: 'renamed',
		});

		expect(JSON.stringify(result)).not.toContain('not allowed');
	});
});
