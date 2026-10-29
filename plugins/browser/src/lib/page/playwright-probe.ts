/**
 * f00125 S1 — Playwright presence probe.
 *
 * The browser plugin does NOT bundle Playwright. When the user calls
 * any tool without an injected driver, we surface an install hint and
 * refuse to spawn. This keeps the package opt-in (Playwright pulls
 * Chromium binaries + a stack of native deps) and the error path
 * fail-soft.
 */
import { spawn } from 'node:child_process';

export const PLAYWRIGHT_INSTALL_HINT =
	'Install Playwright with `bun add -d playwright` and run `bunx playwright install chromium`.';

const hasPlaywright = async (): Promise<boolean> => {
	try {
		// Resolve the import via a child process so a missing dep does not
		// break the host's own module graph.
		const child = spawn(
			'node',
			[
				'-e',
				"import('playwright').then(()=>process.exit(0)).catch(()=>process.exit(1))",
			],
			{
				stdio: 'ignore',
			},
		);
		return await new Promise<boolean>((resolve) => {
			child.once('exit', (code) => resolve(code === 0));
			child.once('error', () => resolve(false));
		});
	} catch {
		return false;
	}
};

export const probePlaywright = async (): Promise<
	| { readonly available: true }
	| { readonly available: false; readonly installHint: string }
> => {
	if (await hasPlaywright()) return { available: true };
	return { available: false, installHint: PLAYWRIGHT_INSTALL_HINT };
};
