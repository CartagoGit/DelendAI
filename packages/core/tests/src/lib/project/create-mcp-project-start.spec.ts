/**
 * Every server publishes its agents' work refs on the policy's cadence,
 * whichever launcher started it and whichever plugins it has loaded
 * (x00724). The publisher used to belong to the commit-policy plugin, which
 * loads lazily and is evicted when idle, so a server that never called one
 * of its tools pushed nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import type { IDelendaiHostConfig } from '@delendai/core/lib/contracts/interfaces/host-config.interface';

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
	StdioServerTransport: class {
		onclose?: () => void;
		onerror?: (error: Error) => void;
		onmessage?: (message: unknown) => void;
		async start(): Promise<void> {}
		async send(): Promise<void> {}
		async close(): Promise<void> {
			this.onclose?.();
		}
	},
}));

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { integration: 'develop' },
		integration: { requiredChecks: ['delendai-validate'] },
	},
});

const hostConfig = (
	overrides: Partial<IDelendaiHostConfig> = {},
): IDelendaiHostConfig => ({
	metadata: { name: 'spec-server', version: '0.0.0', description: 'spec' },
	namespacePrefix: 'spec',
	workspace: createWorkspacePathProvider('/tmp/spec-workspace-start'),
	validationMatrix: { scopes: {} },
	...overrides,
});

const cadenceMs = policy.checkpoint.intervalMinutes * 60_000;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('a started server publishes work refs on the policy cadence', () => {
	it('schedules the publisher when it starts, and stops it when disposed', async () => {
		const scheduled = vi.spyOn(globalThis, 'setInterval');
		const cleared = vi.spyOn(globalThis, 'clearInterval');
		const project = await createMcpProject(
			hostConfig({ developmentPolicy: policy }),
		);
		expect(scheduled.mock.calls.some(([, ms]) => ms === cadenceMs)).toBe(
			false,
		);

		await project.start();
		const call = scheduled.mock.results.findIndex(
			(_, index) => scheduled.mock.calls[index]?.[1] === cadenceMs,
		);
		expect(call).toBeGreaterThanOrEqual(0);

		await project.dispose();
		expect(cleared).toHaveBeenCalledWith(
			scheduled.mock.results[call]?.value,
		);
	});

	it('schedules nothing without a development policy', async () => {
		const scheduled = vi.spyOn(globalThis, 'setInterval');
		const project = await createMcpProject(hostConfig());
		await project.start();
		expect(scheduled.mock.calls.some(([, ms]) => ms === cadenceMs)).toBe(
			false,
		);
		await project.dispose();
	});
});
