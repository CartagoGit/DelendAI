import { coreConfig } from './vitest.config.ts';

/**
 * The core specs that replace a module, a global, a timer or `process.exit`:
 * each keeps a worker of its own. The rest share one (`vitest.config.ts`).
 */
export default coreConfig('isolated');
