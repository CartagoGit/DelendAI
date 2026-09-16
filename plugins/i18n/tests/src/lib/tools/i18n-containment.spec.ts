/**
 * i18n-containment.spec.ts — the i18n tools refuse a `localesDir` whose
 * real location is outside the workspace.
 *
 * Both tools take `localesDir` from the caller and, when no deps
 * override is supplied, build their real filesystem deps from it. The
 * lexical containment check they used is a string comparison, so
 * `workspace/linked` passed while naming another project's catalogues —
 * which would then be reported as this project's translation state.
 *
 * The refusal has to happen BEFORE `realI18nDeps` is constructed, which
 * is what these cases pin.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration, IToolTextResult } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { buildI18nCheckRegistration } from '../../../../src/lib/tools/i18n-check.tool';
import { buildI18nValidateRegistration } from '../../../../src/lib/tools/i18n-validate.tool';

type THandler = (args: Record<string, unknown>) => Promise<IToolTextResult>;

/** The registered handler, captured without a cast. */
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

describe('i18n tools refuse a localesDir outside the workspace', () => {
	let parent = '';
	let workspaceRootAbs = '';
	let outside = '';

	beforeEach(async () => {
		parent = await mkdtemp(join(tmpdir(), 'i18n-containment-'));
		workspaceRootAbs = join(parent, 'workspace');
		outside = join(parent, 'outside');
		await mkdir(join(workspaceRootAbs, 'locales'), { recursive: true });
		await mkdir(outside, { recursive: true });
		// A catalogue that must never be read as this project's.
		await writeFile(
			join(outside, 'en.json'),
			JSON.stringify({ secret: 'stolen' }),
			'utf8',
		);
		await symlink(outside, join(workspaceRootAbs, 'linked'), 'dir');
	});

	afterEach(async () => {
		await rm(parent, { recursive: true, force: true });
	});

	it('i18n_check refuses a localesDir reached through an escaping symlink', async () => {
		const handler = await capture(
			buildI18nCheckRegistration({
				namespacePrefix: 'i18n',
				workspaceRootAbs,
			}),
		);

		const result = await handler({ localesDir: 'linked' });

		expect(JSON.stringify(result)).toContain('not allowed');
		expect(JSON.stringify(result)).not.toContain('stolen');
	});

	it('i18n_validate refuses it too', async () => {
		const handler = await capture(
			buildI18nValidateRegistration({
				namespacePrefix: 'i18n',
				workspaceRootAbs,
			}),
		);

		const result = await handler({ localesDir: 'linked' });

		expect(JSON.stringify(result)).toContain('not allowed');
		expect(JSON.stringify(result)).not.toContain('stolen');
	});

	it('still accepts a localesDir that really is inside', async () => {
		const handler = await capture(
			buildI18nCheckRegistration({
				namespacePrefix: 'i18n',
				workspaceRootAbs,
			}),
		);

		const result = await handler({ localesDir: 'locales' });

		expect(JSON.stringify(result)).not.toContain('not allowed');
	});
});
