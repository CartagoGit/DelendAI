/**
 * doctor/checks/index.ts — f00191 / q00006 Track I.
 *
 * Barrel re-export so the doctor command group can do:
 *   import { checkManifests, checkRuntime, ... } from
 *     '../../lib/doctor/checks';
 *
 * Each individual check module is the unit of testing; this barrel
 * is just an export convenience.
 */
export { checkManifests } from './manifests.check';
export { checkRuntime } from './runtime.check';
export { checkGitStatus, defaultGitProbe } from './git-status.check';
export { checkStaleDocs, defaultStaleDocsProbe } from './stale-docs.check';
export { checkPermissions } from './permissions.check';
export { checkConfig } from './config.check';
export { checkPluginGraph } from './plugin-graph.check';
export { checkDeps } from './deps.check';
export { checkTokenBudgets } from './token-budgets.check';
export { checkBranchProtection } from './branch-protection.check';
export { checkSchemas } from './schemas.check';
export { checkPorts } from './ports.check';
export { checkNetworkDependentSurfaces } from './network.check';
