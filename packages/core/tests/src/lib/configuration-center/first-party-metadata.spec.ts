import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(
	new URL('../../../../../../', import.meta.url),
);

describe('first-party configuration metadata', () => {
	it('keeps every bundled plugin schema-backed and every declared example valid', async () => {
		const pluginsRoot = join(repositoryRoot, 'plugins');
		const entries = await readdir(pluginsRoot, { withFileTypes: true });
		const failures: string[] = [];
		for (const entry of entries.filter((candidate) =>
			candidate.isDirectory(),
		)) {
			const index = join(pluginsRoot, entry.name, 'src', 'index.ts');
			const imported = (await import(pathToFileURL(index).href)) as {
				readonly default?: {
					readonly optionsSchema?: {
						safeParse(value: unknown): {
							readonly success: boolean;
						};
					};
					readonly configExample?: {
						readonly options: Readonly<Record<string, unknown>>;
					};
				};
			};
			const plugin = imported.default;
			if (plugin?.optionsSchema === undefined) {
				failures.push(`${entry.name}: missing optionsSchema`);
				continue;
			}
			if (
				plugin.configExample !== undefined &&
				!plugin.optionsSchema.safeParse(plugin.configExample.options)
					.success
			) {
				failures.push(
					`${entry.name}: configExample rejected by optionsSchema`,
				);
			}
		}
		expect(failures).toEqual([]);
	}, 120_000);
});
