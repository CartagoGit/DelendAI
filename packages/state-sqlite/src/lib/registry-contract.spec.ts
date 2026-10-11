/**
 * registry-contract.spec.ts — the SQLite driver keeps the registry
 * contract: the same assertions the in-memory driver is held to, run
 * against a store on disk.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IStateRegistryOptions } from '@delendai/state';

import { phaseTwoContract } from '../../../state/tests/src/contract/phase-0.2-contract.helper';
import { registryContract } from '../../../state/tests/src/contract/registry-contract.helper';
import { defineSqliteStateRegistry } from './sqlite-driver';

/** Each registry on a store of its own, as each in-memory one is. */
const define = (options: IStateRegistryOptions) =>
	defineSqliteStateRegistry({
		...options,
		path: join(
			mkdtempSync(join(tmpdir(), 'state-contract-')),
			'state.sqlite',
		),
	});

registryContract('sqlite', define);
phaseTwoContract('sqlite', define);
