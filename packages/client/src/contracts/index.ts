/**
 * contracts/index.ts — subpath export for `@delendai/client/contracts`.
 *
 * r00041 S3: the type surface a consumer needs to *describe* a
 * conversation with a delendai server, with nothing that needs Node.
 * `tsconfig.contracts.json` compiles this barrel (and `../transport`)
 * with `"types": []`, so a browser or edge consumer can take these types
 * without `@types/node` on the classpath — the whole reason r00041
 * exists.
 *
 * Values live here only when they are plain data (the settings and
 * transport-error constants). Anything that touches the filesystem or a
 * child process belongs in `@delendai/client/node`.
 */

export * from '../lib/contracts/interfaces/configuration-edit.interface';
export * from '../lib/contracts/interfaces/connection-health.interface';
export * from '../lib/contracts/interfaces/dashboard.interface';
export * from '../lib/contracts/interfaces/health.interface';
export * from '../lib/contracts/interfaces/logs.interface';
export * from '../lib/contracts/interfaces/mcp-transport-error.interface';
export * from '../lib/contracts/interfaces/mcp-transport.interface';
export * from '../lib/contracts/interfaces/memory.interface';
export * from '../lib/contracts/interfaces/plugin-activation.interface';
export * from '../lib/contracts/interfaces/search.interface';
export * from '../lib/contracts/interfaces/settings.interface';
export * from '../lib/contracts/interfaces/tool-descriptor.interface';

export * from '../lib/contracts/constants/client-package.constant';
export * from '../lib/contracts/constants/mcp-transport-error.constant';
export * from '../lib/contracts/constants/settings.constant';
