import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it } from 'vitest';

import { configureToolOutputArtifacts } from '@delendai/core/lib/context-budget/elide-tool-result.service';

/**
 * SIMULATES the leak that breaks truncate-if-too-large.spec.ts on a
 * shared-graph worker: production configures the artifact directory at
 * boot and this spec never clears it, exactly like a surface-booting
 * spec would. File name starts with zz- so it sorts after and cannot
 * mask the ordering the real shard has.
 */
describe('a surface that booted', () => {
	it('left the artifacts directory configured', () => {
		configureToolOutputArtifacts(
			join(mkdtempSync(join(tmpdir(), 'leak-')), 'artifacts'),
		);
	});
});
