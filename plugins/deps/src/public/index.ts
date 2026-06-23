/**
 * Public surface of `@mcp-vertex/deps`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * engine + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	listDeps,
	checkDeps,
	checkOutdated,
	fetchLatestFromNpm,
} from './services/engine';
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
} from './services/engine';
export {
	listPolyglotDeps,
	parseCargoToml,
	parseGoMod,
	parsePyprojectToml,
} from './services/polyglot';
export type {
	IPolyglotDepEntry,
	IPolyglotEcosystem,
	IPolyglotManifest,
} from './services/polyglot';
export { buildDepsToolRegistrations } from '../lib/tools';
export type { IDepsToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
