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
export const isTestPath = (path: string): boolean =>
	/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)(?:\/|$)|\.spec\.|\.test\./.test(
		path,
	);

/**
 * An ignored file that holds secrets by its name: env files, key files,
 * credential and secret configs. Every other ignored file is build output,
 * dependencies or a cache, counted as skipped.
 */
const SECRET_BEARING =
	/(?:^|\/)(?:\.env(?:\.[\w.-]+)?|[\w.-]*(?:credentials?|secrets?)[\w.-]*\.(?:json|ya?ml|toml|ini|env)|[\w.-]+\.(?:pem|key|p12|pfx))$/i;

/**
 * Run a secret scan. `scope` selects the file set ('changed' = working tree,
 * 'tracked' = the whole repo), plus the secret-bearing ignored files that
 * are present. Non-text and (by default) test/fixture files are skipped,
 * and the candidate list is capped to bound the work.
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
	// git ls-files sees only what git tracks or would track, and a local
	// leak sits in an ignored `.env.local`: the scan said clean without
	// reading it.
	const ignored = (await deps.listIgnored?.()) ?? [];
	const ignoredScanned = ignored.filter(
		(path) => !path.includes('node_modules/') && SECRET_BEARING.test(path),
	);
	const files: ISecretScanFile[] = [];
	for (const path of [...candidates, ...ignoredScanned]) {
		const content = await deps.readFile(path);
		if (content !== undefined) files.push({ path, content });
	}
	return {
		scanned: files.length,
		findings: scanSecrets(files),
		ignoredScanned,
		ignoredSkipped: ignored.length - ignoredScanned.length,
	};
};
