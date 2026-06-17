#!/usr/bin/env node
import { runCli } from './lib/cli/assemble';

export {
	assembleCliConfig,
	runCli,
} from './lib/cli/assemble';
export type {
	IAssembleCliDeps,
	IAssembledCliConfig,
} from './lib/cli/assemble';

if (import.meta.main) {
	void runCli(process.argv.slice(2), process.cwd());
}
