/**
 * doctor/checks/manifests.check.ts — f00191 / q00006 Track I.
 *
 * Verifies every plugin directory under `plugins/` ships a parseable
 * `plugin.manifest.ts`. The registry loader (`loadAllPluginManifests`)
 * silently skips a plugin whose manifest cannot be parsed, so this
 * check is the only place a user gets told "your new plugin will not
 * load".
 *
 * The check is intentionally cheap: it does NOT transpile the file.
 * A plugin whose manifest TS is valid TypeScript but evaluates to
 * garbage is caught by the registry loader's `parsePluginManifest`
 * step (logged into `pluginDiagnostic.errors`) and surfaced by the
 * `plugins` section. This check covers the simpler "missing file"
 * drift class.
 */
import type { DoctorCheck } from '../types';

export const MANIFEST_FILENAME = 'plugin.manifest.ts';
export const PLUGINS_DIR = 'plugins';

export const checkManifests: DoctorCheck = async ({ fs }) => {
	const pluginDirs = await fs.listDirs(PLUGINS_DIR);
	if (pluginDirs.length === 0) {
		return {
			name: 'manifests',
			status: 'warn',
			findings: [
				`no plugin directories found under ${PLUGINS_DIR}/ — is the workspace correct?`,
			],
		};
	}
	const missing: string[] = [];
	const suspicious: string[] = [];
	for (const dir of pluginDirs) {
		const rel = `${PLUGINS_DIR}/${dir}/${MANIFEST_FILENAME}`;
		if (!(await fs.fileExists(rel))) {
			missing.push(dir);
			continue;
		}
		const body = await fs.readFile(rel);
		if (body === undefined || body.trim().length === 0) {
			suspicious.push(`${dir} (empty)`);
			continue;
		}
		// A real manifest module always calls `definePluginManifest(`
		// somewhere in the file body. We do not transpile — we just
		// sanity-check the surface token.
		if (!body.includes('definePluginManifest')) {
			suspicious.push(`${dir} (no definePluginManifest call)`);
		}
	}
	if (missing.length === 0 && suspicious.length === 0) {
		return {
			name: 'manifests',
			status: 'ok',
			findings: [`${pluginDirs.length} plugin manifest(s) present`],
		};
	}
	const findings: string[] = [];
	if (missing.length > 0) {
		findings.push(`missing ${MANIFEST_FILENAME}: ${missing.join(', ')}`);
	}
	if (suspicious.length > 0) {
		findings.push(`suspicious manifests: ${suspicious.join(', ')}`);
	}
	return { name: 'manifests', status: 'warn', findings };
};
