/**
 * The forges that can rewrite a change request's text are found by name
 * and an absent plugin is skipped (x01023).
 */
import { describe, expect, it } from 'vitest';

import type { IChangeRequestForge } from '@delendai/core/lib/contracts/interfaces/change-request-forge.interface';
import {
	loadChangeRequestForges,
	pullRequestPorts,
} from '@delendai/core/lib/work-units/change-request-forges.service';

const forge = (id: string): IChangeRequestForge => ({
	id,
	handles: () => true,
	findOpen: () => undefined,
	read: () => undefined,
	update: () => true,
});

const loader =
	(plugins: Readonly<Record<string, unknown>>) =>
	(specifier: string): Promise<unknown> =>
		specifier in plugins
			? Promise.resolve(plugins[specifier])
			: Promise.reject(new Error(`Cannot find package ${specifier}`));

describe('loadChangeRequestForges', () => {
	it('returns the adapter each forge plugin exposes', async () => {
		const forges = await loadChangeRequestForges(
			'/w',
			loader({
				'@delendai/github': {
					default: { changeRequestForge: forge('github') },
				},
				'@delendai/gitlab': {
					default: { changeRequestForge: forge('gitlab') },
				},
			}),
		);
		expect(forges.map((entry) => entry.id)).toEqual(['github', 'gitlab']);
	});

	it('skips a plugin that is not installed or exposes no adapter', async () => {
		const forges = await loadChangeRequestForges(
			'/w',
			loader({ '@delendai/github': { default: {} } }),
		);
		expect(forges).toEqual([]);
	});
});

describe('pullRequestPorts', () => {
	it('gives the adapters a runner that parses JSON and survives a failure', async () => {
		const ports = await pullRequestPorts(
			'/definitely/not/a/checkout',
			loader({
				'@delendai/gitlab': {
					default: { changeRequestForge: forge('gitlab') },
				},
			}),
		);
		expect(ports.forges?.map((entry) => entry.id)).toEqual(['gitlab']);
		// The CLI is not there (or the checkout is not): every answer is absent.
		expect(ports.run?.text('no-such-forge-cli', [])).toBeUndefined();
		expect(ports.run?.json('no-such-forge-cli', [])).toBeUndefined();
		expect(ports.gh(['--version'])).toBeUndefined();
		expect(ports.git(['status'])).toBeUndefined();
	});

	it('parses what a forge CLI prints as JSON', async () => {
		const ports = await pullRequestPorts('/', loader({}));
		// `node -p` is on every machine that runs these specs.
		expect(
			ports.run?.json('node', ['-p', 'JSON.stringify({a:1})']),
		).toEqual({
			a: 1,
		});
		expect(ports.run?.json('node', ['-p', '"not json"'])).toBeUndefined();
	});
});
