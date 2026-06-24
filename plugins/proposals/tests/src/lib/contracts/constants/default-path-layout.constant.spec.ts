import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PATH_LAYOUT,
	buildSwarmPaths,
} from '@mcp-vertex/proposals/lib/contracts/constants/default-path-layout.constant';

describe('buildSwarmPaths', async () => {
	it('roots every cache artefact under the given cacheDir', async () => {
		const layout = buildSwarmPaths('.cache/x/swarm', 'docs/x');
		expect(layout.lockFile).toBe('.cache/x/swarm/agents.lock.json');
		expect(layout.taskQueueFile).toBe(
			'.cache/x/swarm/agent-queue/queue.json',
		);
		expect(layout.scratchDir).toBe('.cache/x/swarm');
	});

	it('roots human-edited proposals under the given docsDir', async () => {
		const layout = buildSwarmPaths('.cache/x/swarm', 'docs/x');
		expect(layout.proposalsDir).toBe('docs/x/proposals');
		expect(layout.proposalIndexFile).toBe('docs/x/proposals/index.json');
	});
});

describe('DEFAULT_PATH_LAYOUT', async () => {
	it('defaults to the mcp-vertex layout (.cache/mcp-vertex + docs/mcp-vertex/proposals)', async () => {
		expect(DEFAULT_PATH_LAYOUT.scratchDir).toBe('.cache/mcp-vertex');
		expect(DEFAULT_PATH_LAYOUT.lockFile).toBe(
			'.cache/mcp-vertex/agents.lock.json',
		);
		expect(DEFAULT_PATH_LAYOUT.proposalsDir).toBe(
			'docs/mcp-vertex/proposals',
		);
	});

	it('keeps every artefact inside the scratch or proposals dirs', async () => {
		const { proposalsDir, scratchDir, ...artefacts } = DEFAULT_PATH_LAYOUT;
		for (const value of Object.values(artefacts)) {
			const inScratch = value.startsWith(`${scratchDir}/`);
			const inProposals = value.startsWith(`${proposalsDir}/`);
			expect(inScratch || inProposals).toBe(true);
		}
	});
});
