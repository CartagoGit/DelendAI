import { defineProject } from 'vitest/config';

import shared from '../../vitest.shared';

export default defineProject({
	...shared,
	test: {
		...shared.test,
		name: 'database',
		workspaceAliases: shared.test?.workspaceAliases ?? {},
		sharedSetupFiles: shared.test?.sharedSetupFiles ?? [],
	},
});