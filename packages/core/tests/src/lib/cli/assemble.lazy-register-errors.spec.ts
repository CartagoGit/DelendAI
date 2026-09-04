/**
 * A plugin that fails on the managed-lazy route must still reach the
 * `onRegisterError` observers — the same channel the error-reporting
 * plugin subscribes to.
 *
 * The eager route collected those observers and replayed failures into
 * them; the lazy route never did. Since managed-lazy is the DEFAULT
 * surface, that meant a plugin which failed to load or activate was
 * announced on stderr and reported to the maintainers never — the
 * failures most worth reporting were exactly the ones nobody heard.
 *
 * Ordering is the whole difficulty: a lazy observer is usually
 * activated AFTER the failure it should hear about, so both directions
 * are tested here.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import type { IPluginRegisterErrorInfo } from '@delendai/core/lib/contracts/interfaces/plugin-lifecycle-error.interface';
import { fakePartial } from '@delendai/test-kit/public';

/**
 * Two ids that are real entries in `managed-lazy-catalog.generated.ts`
 * — the lazy route refuses any plugin it cannot find there, so a
 * made-up id would silently fall back to eager and test nothing.
 */
const OBSERVER_PLUGIN = 'logs';
const FAILING_PLUGIN = 'cache';

let workspace: string;

const fileReader =
	(config: string) =>
	async (absolutePath: string): Promise<string | undefined> =>
		absolutePath.endsWith('delendai.config.json') ? config : undefined;

/**
 * Stand-ins for the two real packages: one registers an observer, the
 * other refuses to import at all.
 */
const importFor =
	(seen: IPluginRegisterErrorInfo[]) =>
	async (specifier: string): Promise<{ default: unknown }> => {
		if (specifier.includes(FAILING_PLUGIN)) {
			throw new Error('boom: this module cannot be imported');
		}
		return {
			default: {
				name: OBSERVER_PLUGIN,
				register: () => ({
					onRegisterError: (info: IPluginRegisterErrorInfo) => {
						seen.push(info);
					},
				}),
			},
		};
	};

/**
 * The only part of the assembled config these cases read. Declared once,
 * as a fake of the real shape, so the tests state what they depend on
 * instead of casting the whole result away three times.
 */
interface IAssembledLazyView {
	readonly config: {
		readonly lazyPluginActivators?: ReadonlyMap<
			string,
			() => Promise<void>
		>;
	};
}

const lazyViewOf = (assembled: unknown): IAssembledLazyView =>
	fakePartial<IAssembledLazyView, 'config'>(assembled as IAssembledLazyView);

const assembleWith = async (seen: IPluginRegisterErrorInfo[]) =>
	assembleCliConfig(
		parseCliArgs(
			[
				'--workspace',
				workspace,
				`--plugins=${OBSERVER_PLUGIN},${FAILING_PLUGIN}`,
			],
			workspace,
		),
		{
			readFile: fileReader(JSON.stringify({})),
			import: importFor(seen),
		},
	);

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'lazy-register-errors-'));
	await writeFile(join(workspace, 'package.json'), '{"name":"x"}', 'utf8');
});

afterEach(async () => {
	await rm(workspace, { recursive: true, force: true });
});

describe('managed-lazy assembly — register-error observers', () => {
	it('takes the lazy route for these plugins', async () => {
		// Guards the premise of the other two cases: if either id ever
		// leaves the generated catalog, assembly silently degrades to
		// eager and the tests below would pass for the wrong reason.
		const seen: IPluginRegisterErrorInfo[] = [];
		const assembled = lazyViewOf(await assembleWith(seen));
		expect(
			assembled.config.lazyPluginActivators?.size ?? 0,
		).toBeGreaterThan(0);
	});

	it('reports a lazy activation failure to an already-activated observer', async () => {
		const seen: IPluginRegisterErrorInfo[] = [];
		const assembled = lazyViewOf(await assembleWith(seen));
		const activators = assembled.config.lazyPluginActivators;
		await activators?.get(OBSERVER_PLUGIN)?.();
		await activators
			?.get(FAILING_PLUGIN)?.()
			.catch(() => undefined);
		expect(seen.map((info) => info.pluginName)).toContain(FAILING_PLUGIN);
		expect(
			seen.some((info) =>
				String(
					info.error instanceof Error
						? info.error.message
						: info.error,
				).includes('boom'),
			),
		).toBe(true);
	});

	it('replays failures that happened before the observer existed', async () => {
		// The common ordering in practice: something fails on first use,
		// and the reporting plugin is only activated later. Without the
		// backlog the report is lost precisely when it matters.
		const seen: IPluginRegisterErrorInfo[] = [];
		const assembled = lazyViewOf(await assembleWith(seen));
		const activators = assembled.config.lazyPluginActivators;
		await activators
			?.get(FAILING_PLUGIN)?.()
			.catch(() => undefined);
		expect(seen).toHaveLength(0);
		await activators?.get(OBSERVER_PLUGIN)?.();
		expect(seen.map((info) => info.pluginName)).toContain(FAILING_PLUGIN);
	});
});
