import { toolsConfig } from './vitest.config.ts';

/** The tools specs that replace something process-wide keep a worker of their own. */
export default toolsConfig('isolated');
