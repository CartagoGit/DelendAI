import { describe, expect, it } from 'vitest';

import { buildAutoStatusRegistration } from '../../../../src/lib/tools/auto-status.tool';
import type {
	IDiscoveryDeps,
	IDiscoveredRoster,
} from '../../../../src/lib/contracts/interfaces/roster.interface';
import type { IRosterSnapshotStore } from '../../../../src/lib/discovery/roster-store';

type ToolHandler = () => Promise<{
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
}>;

/** Register the tool against a fake server and capture its handler. */
const capture = async (
	deps: IDiscoveryDeps,
	rosterStore?: IRosterSnapshotStore,
): Promise<ToolHandler> => {
	let handler: ToolHandler | undefined;
	const server = {
		registerTool(name: string, _config: unknown, fn: ToolHandler): void {
			if (name.endsWith('_auto_status')) handler = fn;
		},
	};
	const reg = buildAutoStatusRegistration({
		namespacePrefix: 'mcp',
		deps,
		...(rosterStore !== undefined ? { rosterStore } : {}),
	});
	await reg.register(server as unknown as Parameters<typeof reg.register>[0]);
	if (!handler) throw new Error('auto_status did not register a handler');
	return handler;
};

const deps = (
	onPath: readonly string[],
	env: Record<string, string | undefined> = {},
): IDiscoveryDeps => ({
	commandExists: async (command) => onPath.includes(command),
	env,
});

describe('auto_status tool', () => {
	it('registers under the prefixed name and reports the reachable roster', async () => {
		const handler = await capture(
			deps(['claude'], { OPENAI_API_KEY: 'sk' }),
		);
		const res = await handler();
		const body = res.structuredContent as {
			availableCount: number;
			available: { id: string }[];
			missing: { id: string }[];
		};
		expect(body.availableCount).toBe(2);
		expect(body.available.map((p) => p.id).sort()).toEqual([
			'claude-cli',
			'openai-api',
		]);
		expect(body.missing.length).toBeGreaterThan(0);
		expect(res.structuredContent?.persisted).toBe(true);
	});

	it('persists the live discovery on first use without exposing API-key values', async () => {
		const saved: IDiscoveredRoster[] = [];
		const handler = await capture(
			deps(['claude'], { OPENAI_API_KEY: 'secret-value' }),
			{ save: async (roster) => void saved.push(roster) },
		);
		await handler();
		expect(saved).toHaveLength(1);
		expect(saved[0]?.available).toContainEqual(
			expect.objectContaining({
				id: 'openai-api',
				reach: 'OPENAI_API_KEY',
			}),
		);
	});

	it('reports an empty roster (all missing) when nothing is reachable', async () => {
		const handler = await capture(deps([], {}));
		const res = await handler();
		const body = res.structuredContent as {
			availableCount: number;
			available: unknown[];
		};
		expect(body.availableCount).toBe(0);
		expect(body.available).toEqual([]);
	});

	it('exposes the expected tool id + tags', () => {
		const reg = buildAutoStatusRegistration({ namespacePrefix: 'mcp' });
		expect(reg.id).toBe('auto_status');
		expect(reg.tags).toContain('orchestration');
	});
});
