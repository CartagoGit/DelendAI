/**
 * real-deps.ts — production I/O adapter: read every `*.json` locale file under
 * a directory. The only module here that touches the OS. Never throws (a
 * missing dir or unparseable file is skipped).
 */
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type {
	II18nScanDeps,
	ILocaleFile,
} from '../contracts/interfaces/i18n.interface';

/** Production i18n deps: read `*.json` locale files from `localesDir`. */
export const realI18nDeps = (
	workspaceRootAbs: string,
	localesDir: string,
): II18nScanDeps => ({
	listLocales: async () => {
		const dir = isAbsolute(localesDir)
			? localesDir
			: join(workspaceRootAbs, localesDir);
		const entries = await readdir(dir, { withFileTypes: true }).catch(
			() => [],
		);
		const out: ILocaleFile[] = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
			try {
				const data = JSON.parse(
					await readFile(join(dir, entry.name), 'utf8'),
				) as Record<string, unknown>;
				if (data !== null && typeof data === 'object') {
					out.push({
						locale: entry.name.replace(/\.json$/, ''),
						data,
					});
				}
			} catch {
				// skip an unparseable locale file
			}
		}
		return out;
	},
});
