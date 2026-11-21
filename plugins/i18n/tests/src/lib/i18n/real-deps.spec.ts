/**
 * real-deps.spec.ts — an unreadable locale catalogue is an error naming
 * the file. Skipped, it vanished from the check, and a corrupt `en.json`
 * silently made another language the base.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolTextResult } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { realI18nDeps } from '../../../../src/lib/i18n/real-deps';
import { buildI18nCheckRegistration } from '../../../../src/lib/tools/i18n-check.tool';
import { buildI18nValidateRegistration } from '../../../../src/lib/tools/i18n-validate.tool';

type THandler = (args: Record<string, unknown>) => Promise<IToolTextResult>;

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

describe('a corrupt locale catalogue', () => {
	let workspaceRootAbs = '';

	beforeEach(async () => {
		workspaceRootAbs = await mkdtemp(join(tmpdir(), 'i18n-corrupt-'));
		await mkdir(join(workspaceRootAbs, 'locales'));
		await writeFile(
			join(workspaceRootAbs, 'locales', 'en.json'),
			'{ "a": ',
			'utf8',
		);
		await writeFile(
			join(workspaceRootAbs, 'locales', 'es.json'),
			JSON.stringify({ a: 'b' }),
			'utf8',
		);
	});

	afterEach(async () => {
		await rm(workspaceRootAbs, { recursive: true, force: true });
	});

	it('is an error naming the file, not a skipped locale', async () => {
		await expect(
			realI18nDeps(workspaceRootAbs, 'locales').listLocales(),
		).rejects.toThrow(/en\.json/);
	});

	it('refuses an array in place of an object of messages', async () => {
		await writeFile(
			join(workspaceRootAbs, 'locales', 'en.json'),
			'[]',
			'utf8',
		);
		await expect(
			realI18nDeps(workspaceRootAbs, 'locales').listLocales(),
		).rejects.toThrow(/not an object of messages/);
	});

	it('makes both tools fail instead of reporting es as the base', async () => {
		for (const build of [
			buildI18nValidateRegistration,
			buildI18nCheckRegistration,
		]) {
			const handler = await capture(
				build({ namespacePrefix: 'i18n', workspaceRootAbs }),
			);
			const text = JSON.stringify(
				await handler({ localesDir: 'locales' }),
			);
			expect(text).toContain('en.json');
			expect(text).not.toContain('"sourceLocale":"es"');
		}
	});
});
