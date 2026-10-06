/**
 * Public surface of `@delendai/deps`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * engine + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	listDeps,
	checkDeps,
	checkOutdated,
	fetchLatestFromNpm,
} from '../lib/services/engine';
export type {
	IDepEntry,
	IDepSection,
	IDepsInventory,
	IDepsFinding,
	IDepsFindingKind,
	IDepsHealth,
	IDepsOutdatedReport,
	IOutdatedEntry,
	ILatestVersionFetcher,
} from '../lib/services/engine';
export {
	listPolyglotDeps,
	parseCargoToml,
	parseGoMod,
	parsePyprojectToml,
} from '../lib/services/polyglot';
export type {
	IPolyglotDepEntry,
	IPolyglotEcosystem,
	IPolyglotManifest,
} from '../lib/services/polyglot';
export { buildDepsToolRegistrations } from '../lib/tools';
export type { IDepsToolOptions } from '../lib/tools';
export { parseBunAudit, runDepsAudit } from '../lib/services/audit';
export {
	classifyLicense,
	realLicenseDeps,
	scanLicenses,
} from '../lib/services/licenses';
export type {
	ILicenseClass,
	ILicenseScanDeps,
} from '../lib/contracts/interfaces/licenses.interface';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
