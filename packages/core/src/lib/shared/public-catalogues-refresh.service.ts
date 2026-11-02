/**
 * public-catalogues-refresh.service.ts — at each MCP start, both public
 * catalogues are asked whether they changed, beside the start and never
 * in its way.
 *
 * An unchanged catalogue costs a conditional request and no download; a
 * source that fails leaves the copy in place. `DELENDAI_OFFLINE=1` skips
 * it, and so does a test run (VITEST), which must not reach the network.
 */
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import type { ICatalogueSources } from '../contracts/interfaces/public-catalogue.interface';
import {
	DEFAULT_CONFIG_FILENAME,
	parseConfigFile,
} from '../plugins/load-config-file';
import { readAgentRegistry } from './agent-registry.service';
import { readModelCatalogue } from './model-catalogue.service';
import { catalogueSources } from './public-catalogue-sources.service';

/** Refresh both catalogues for `workspace`; resolves when both are settled, never rejects. */
export const refreshPublicCatalogues = async (input: {
	readonly workspace: string;
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
	readonly read?:
		| {
				readonly models: (
					sources: readonly string[],
				) => Promise<unknown>;
				readonly agents: (
					sources: readonly string[],
				) => Promise<unknown>;
		  }
		| undefined;
}): Promise<boolean> => {
	const env = input.env ?? process.env;
	if (env.DELENDAI_OFFLINE === '1' || env.VITEST !== undefined) return false;
	const configured: ICatalogueSources | undefined = parseConfigFile(
		await readFile(
			join(input.workspace, DEFAULT_CONFIG_FILENAME),
			'utf8',
		).catch(() => undefined),
	).catalogues;
	const read = input.read ?? {
		models: (sources: readonly string[]) => readModelCatalogue({ sources }),
		agents: (sources: readonly string[]) => readAgentRegistry({ sources }),
	};
	await Promise.allSettled([
		read.models(catalogueSources('models', [configured])),
		read.agents(catalogueSources('agents', [configured])),
	]);
	return true;
};
