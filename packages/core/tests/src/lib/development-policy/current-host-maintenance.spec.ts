import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
	createHostMaintenance,
	currentHostMaintenance,
} from '@delendai/core/lib/development-policy/maintenance-lease.service';

describe('currentHostMaintenance', () => {
	it('is the maintenance this process made, so plugins ask the same gate', () => {
		const made = createHostMaintenance({
			path: join(tmpdir(), 'no-lease-taken-here.json'),
		});
		expect(currentHostMaintenance()).toBe(made);
	});
});
