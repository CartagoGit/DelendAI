/**
 * registry-properties.spec.ts — the SQLite driver keeps the properties
 * the in-memory driver is held to: an incremental build equals a clean
 * rebuild, two registries fed the same sequence agree, and a corrupt
 * generation is recovered without replay.
 */
import type { IStateRegistryOptions } from '@delendai/state';

import { corruptionProperty } from '../../../state/tests/src/contract/corruption-property.helper';
import { determinismProperty } from '../../../state/tests/src/contract/determinism-property.helper';
import { equivalenceProperty } from '../../../state/tests/src/contract/equivalence-property.helper';
import { defineSqliteStateRegistry } from './sqlite-driver';

/** A private store per registry; in memory, as nothing reads it back. */
const define = (options: IStateRegistryOptions) =>
	defineSqliteStateRegistry({ ...options, path: ':memory:' });

equivalenceProperty('sqlite', define);
determinismProperty('sqlite', define);
corruptionProperty('sqlite', define);
