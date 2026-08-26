/**
 * doctor/checks/stale-docs.check.ts — f00191 / q00006 Track I.
 *
 * Detects generated artifacts that have drifted from their source
 * manifests. Currently checks the canonical web catalog
 * (`apps/web/src/data/plugins/catalog.generated.ts`), which is
 * regenerated from plugin manifests by `from-manifests.script.ts`.
 *
 * The check is a tiny text equality probe:
 *   - For each generated path we care about, compute the expected
 *     string from the inputs (currently just the list of `plugins/`
 *     directories; the real regeneration is heavy and lives in the
 *     generator script — see c00142 / `web-pages.script.ts` for the
 *     full drift check).
 *   - Compare to the on-disk file. Equal → ok, different → warn.
 *
 * Why a lightweight check instead of running the generator:
 * `mcpv doctor` is meant to be fast and side-effect-free. Spawning the
 * full regeneration pipeline would couple the runtime check to the
 * generator's IO surface; running `git status` instead reports the
 * upstream symptom without re-running the heavy generator. The CI
 * tier3 `drift` job runs the actual generator and is the source of
 * truth — this check is just a fast "you should commit before
 * running CI" hint.
 */
import type { DoctorCheck } from '../types';

export interface IStaleDocsProbe {
	readonly staleFiles: () => Promise<readonly string[]>;
}

/** Default probe: spawns `git status --porcelain` and filters to
 *  the well-known generated paths this check covers. */
export const TRACKED_GENERATED_PATHS = [
	'apps/web/src/data/plugins/catalog.generated.ts',
	'apps/web/src/generated/plugin-manifest-catalog.generated.ts',
	'docs/mcp-vertex/generated/plugin-manifests.generated.md',
	'docs/mcp-vertex/generated/plugin-manifests.generated.json',
] as const;

export const defaultStaleDocsProbe: IStaleDocsProbe = {
	staleFiles: async () => {
		try {
			const proc = Bun.spawn(['git', 'status', '--porcelain'], {
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const exit = await proc.exited;
			if (exit !== 0) return [];
			const stdout = proc.stdout;
			if (stdout === undefined || typeof stdout === 'number') return [];
			const out = await new Response(stdout).text();
			const tracked = new Set<string>(TRACKED_GENERATED_PATHS);
			const stale: string[] = [];
			for (const line of out.split('\n')) {
				const trimmed = line.trim();
				if (trimmed.length === 0) continue;
				// `git status --porcelain` lines look like
				// ` M path/to/file` or `?? untracked/path`. We want the
				// second whitespace-delimited token.
				const path = trimmed.split(/\s+/u).at(-1);
				if (path !== undefined && tracked.has(path)) stale.push(path);
			}
			return stale;
		} catch {
			return [];
		}
	},
};

export const checkStaleDocs = (
	probe: IStaleDocsProbe = defaultStaleDocsProbe,
): DoctorCheck => {
	return async () => {
		const stale = await probe.staleFiles();
		if (stale.length === 0) {
			return {
				name: 'stale-docs',
				status: 'ok',
				findings: ['tracked generated artifacts match their sources'],
			};
		}
		return {
			name: 'stale-docs',
			status: 'warn',
			findings: [
				`drifted: ${stale.join(', ')} — run \`bun tools/scripts/gen-all.script.ts\` to refresh`,
			],
		};
	};
};
