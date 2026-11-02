/**
 * real-deps.ts — production I/O adapter: match files by glob under the
 * workspace root and stat each for its byte size. The only module here that
 * touches the OS. Never throws (an unreadable or vanished file is skipped).
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IFileSize,
	IPerfScanDeps,
} from '../contracts/interfaces/perf.interface';

/** Production perf deps rooted at `workspaceRootAbs`, globbing via Bun.Glob. */
export const realPerfDeps = (workspaceRootAbs: string): IPerfScanDeps => ({
	listSizes: async (globs) => {
		const seen = new Set<string>();
		const out: IFileSize[] = [];
		for (const pattern of globs) {
			const glob = new Bun.Glob(pattern);
			for await (const rel of glob.scan({
				cwd: workspaceRootAbs,
				onlyFiles: true,
				dot: false,
			})) {
				if (seen.has(rel)) continue;
				seen.add(rel);
				try {
					const info = await stat(join(workspaceRootAbs, rel));
					out.push({ path: rel, bytes: info.size });
				} catch {
					// file vanished or is unreadable — skip it
				}
			}
		}
		return out;
	},
});
