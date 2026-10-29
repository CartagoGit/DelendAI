import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIRST_PARTY_PLUGIN_INDEX } from '@delendai/core/public';

const repositoryRoot = fileURLToPath(
	new URL('../../../../../../', import.meta.url),
);

type ImportedPlugin = {
	readonly default?: {
		readonly example?: Readonly<Record<string, unknown>> | undefined;
		readonly configExample?:
			| {
					readonly example?:
						| Readonly<Record<string, unknown>>
						| undefined;
					readonly options: Readonly<Record<string, unknown>>;
			  }
			| undefined;
	};
};

const expectedExample = (
	plugin: ImportedPlugin['default'],
): Readonly<Record<string, unknown>> | undefined =>
	plugin?.example ??
	plugin?.configExample?.example ??
	plugin?.configExample?.options;

describe('FIRST_PARTY_PLUGIN_INDEX examples', () => {
	it('mirrors each plugin example in the bundled registry entry', async () => {
		const pluginsRoot = join(repositoryRoot, 'plugins');
		const entries = await readdir(pluginsRoot, { withFileTypes: true });
		const failures: string[] = [];

		for (const entry of entries.filter((candidate) =>
			candidate.isDirectory(),
		)) {
			const modulePath = pathToFileURL(
				join(pluginsRoot, entry.name, 'src', 'index.ts'),
			).href;
			const imported = (await import(modulePath)) as ImportedPlugin;
			const indexEntry = FIRST_PARTY_PLUGIN_INDEX.entries.find(
				(candidate) => candidate.id === entry.name,
			);
			if (indexEntry === undefined) {
				failures.push(`${entry.name}: missing registry entry`);
				continue;
			}

			const expected = expectedExample(imported.default);
			if (expected === undefined) {
				if (indexEntry.example !== undefined) {
					failures.push(`${entry.name}: unexpected registry example`);
				}
				continue;
			}

			expect(indexEntry.example).toEqual(expected);
		}

		expect(failures).toEqual([]);
	});
});
