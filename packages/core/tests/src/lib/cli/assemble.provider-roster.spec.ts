/**
 * assemble.provider-roster.spec.ts — the root `providers` roster every
 * plugin is handed: the entries that validate, and nothing else.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WORKSPACE = createTestWorkspace('delendai-provider-roster-');
afterAll(() => removeTestWorkspace(WORKSPACE));

const provider = (id: string) => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command: id },
	modelId: `${id}-model`,
	contextWindow: 200_000,
	costTier: 2,
	strengths: [],
	weaknesses: [],
});

let handed: readonly { readonly id: string }[] | undefined;
let registeredOnce = false;

/** Read back through a function: the assignment happens in a callback the compiler cannot follow. */
const handedIds = (): readonly string[] => {
	if (!registeredOnce) throw new Error('the plugin never registered');
	return (handed ?? []).map((entry) => entry.id);
};

const plugin = {
	name: 'rosterPlugin',
	register: (context: { providers?: readonly { readonly id: string }[] }) => {
		handed = context.providers;
		registeredOnce = true;
		return {};
	},
};

const assemble = async (config: unknown) =>
	assembleCliConfig(
		parseCliArgs(
			[
				'--plugins=rosterPlugin',
				`--workspace=${WORKSPACE}`,
				'--surface=native',
			],
			WORKSPACE,
		),
		{
			readFile: async (path: string) =>
				path.endsWith('delendai.config.json') && config !== undefined
					? JSON.stringify(config)
					: undefined,
			import: async () => ({ default: plugin }),
		},
	);

describe('the provider roster a plugin is handed', () => {
	it('is the root roster without its invalid entries', async () => {
		registeredOnce = false;
		await assemble({
			providers: [
				provider('alpha'),
				{ ...provider('beta'), kind: 'telepathy' },
			],
		});
		expect(handedIds()).toEqual(['alpha']);
	});

	it('is empty when the configuration declares none', async () => {
		registeredOnce = false;
		await assemble(undefined);
		expect(handedIds()).toEqual([]);
	});
});
