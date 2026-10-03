/**
 * run-scan.ts — the scan orchestrator: list candidate files (over an injected
 * seam), read + filter them, and run the pure `scanSecrets`. Test/fixture
 * files are skipped by default (they legitimately hold sample secrets). Pure
 * over `ISecretScanDeps`; never throws.
 */
import type {
	ISecretScanDeps,
	ISecretScanFile,
	ISecretScanOutcome,
} from '../contracts/interfaces/secrets.interface';
import { scanSecrets } from './scan-secrets';

/** Text file extensions worth scanning (skips binaries/images/lockfiles). */
const TEXT_EXT =
	/\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|ya?ml|env|toml|sh|bash|zsh|astro|scss|css|html|txt|xml|ini|cfg|conf)$/i;

/** Test/fixture paths hold sample secrets by design — skipped unless asked. */
const isTestPath = (path: string): boolean =>
	/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)(?:\/|$)|\.spec\.|\.test\./.test(
		path,
	);

/**
 * Run a secret scan. `scope` selects the file set ('changed' = working tree,
 * 'tracked' = the whole repo). Non-text and (by default) test/fixture files
 * are skipped, and the candidate list is capped to bound the work.
 */
export const runSecretScan = async (
	deps: ISecretScanDeps,
	options: {
		readonly scope: 'changed' | 'tracked';
		readonly includeTests: boolean;
		readonly maxFiles?: number;
	},
): Promise<ISecretScanOutcome> => {
	const all = await deps.listFiles(options.scope);
	const candidates = all
		.filter(
			(path) =>
				TEXT_EXT.test(path) &&
				(options.includeTests || !isTestPath(path)),
		)
		.slice(0, options.maxFiles ?? 5000);
	const files: ISecretScanFile[] = [];
	for (const path of candidates) {
		const content = await deps.readFile(path);
		if (content !== undefined) files.push({ path, content });
	}
	return { scanned: files.length, findings: scanSecrets(files) };
};
