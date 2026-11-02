/**
 * caller-checkout.spec.ts — a call bound to a checkout that cannot be
 * opened is refused, never answered from the server's workspace.
 */
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';
import { runInExecutionRoot } from '@delendai/core/lib/shared/execution-root';
import { createFakeToolServer } from '@delendai/test-kit';

import plugin from '../../src/index';

type IHandler = (args: unknown) => Promise<{
	isError?: boolean;
	content: Array<{ text: string }>;
}>;

describe('the roadmap tools and the caller checkout', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const dir = () => {
		const made = mkdtempSync(join(tmpdir(), 'roadmap-checkout-'));
		dirs.push(made);
		return made;
	};

	it('refuses a checkout whose roadmap file escapes it, instead of answering from the server', async () => {
		const served = dir();
		writeFileSync(join(served, 'ROADMAP.md'), '# Roadmap\n');
		const outside = dir();
		writeFileSync(join(outside, 'ROADMAP.md'), '# Elsewhere\n');
		const unit = dir();
		mkdirSync(join(unit, 'docs/delendai'), { recursive: true });
		symlinkSync(join(outside, 'ROADMAP.md'), join(unit, 'ROADMAP.md'));
		const ctx: IMcpPluginContext = {
			workspace: {
				root: served,
				resolve: (rel: string) => join(served, rel),
			},
			corePaths: {
				cacheDir: '.cache/delendai',
				docsDir: 'docs/delendai',
			},
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			keepLegacy: false,
			pluginCacheDir: '.cache/delendai/roadmap',
			pluginDocsDir: 'docs/delendai/roadmap',
			namespacePrefix: 'x',
			options: { file: 'ROADMAP.md' },
			args: {},
		};
		const tools: Record<string, IHandler> = {};
		const server = createFakeToolServer({
			onRegisterTool: ({ name, handler }) => {
				tools[name] = handler as IHandler;
			},
		});
		for (const registration of (await plugin.register(ctx)).tools ?? [])
			await registration.register(server);
		const show = tools.x_roadmap_show as IHandler;
		const answered = await runInExecutionRoot(unit, () => show({})).then(
			(result) => JSON.stringify(result),
			(error: unknown) => String(error),
		);
		expect(answered).toContain('could not be opened');
		expect(answered).not.toContain('Elsewhere');
	});
});
