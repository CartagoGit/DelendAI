import { describe, expect, it } from 'vitest';

import {
	ServerEntrySchema,
	type IServerEntry,
} from '../../../src/lib/options-schema';
import {
	ExternalServerRegistry,
	type IRegistryServerEntry,
	type IStdioChildProcess,
	type StdioSpawner,
} from '../../../src/lib/subprocess/server-registry';

const REGISTRY_CONTRACT_KEYS = {
	args: true,
	command: true,
	detect: true,
	eager: true,
	enabled: true,
	env: true,
	namespacePrefix: true,
	version: true,
} satisfies Record<keyof IRegistryServerEntry, true>;

type Assert<T extends true> = T;
type SchemaKeys = keyof IServerEntry;
type RegistryKeys = keyof typeof REGISTRY_CONTRACT_KEYS;
type KeysMatch = [
	Exclude<SchemaKeys, RegistryKeys>,
	Exclude<RegistryKeys, SchemaKeys>,
] extends [never, never]
	? true
	: false;

const keysMatch: Assert<KeysMatch> = true;
void keysMatch;

class FakeChild implements IStdioChildProcess {
	private stdoutListeners: Array<(chunk: string) => void> = [];
	private exitListeners: Array<(code: number | null) => void> = [];
	private errorListeners: Array<(error: Error) => void> = [];

	constructor(readonly pid: number) {}

	onStdout(listener: (chunk: string) => void): void {
		this.stdoutListeners.push(listener);
	}

	onExit(listener: (code: number | null) => void): void {
		this.exitListeners.push(listener);
	}

	onError(listener: (error: Error) => void): void {
		this.errorListeners.push(listener);
	}

	write(): void {}

	kill(): void {}

	emitStdout(chunk: string): void {
		for (const listener of this.stdoutListeners) listener(chunk);
	}

	emitExit(code: number | null): void {
		for (const listener of this.exitListeners) listener(code);
	}

	emitError(error: Error): void {
		for (const listener of this.errorListeners) listener(error);
	}

	reply(index: number, body: Record<string, unknown>): void {
		this.emitStdout(
			`${JSON.stringify({ jsonrpc: '2.0', id: index + 1, ...body })}\n`,
		);
	}
}

const entry = (over: Record<string, unknown> = {}): IServerEntry => ({
	version: '1.4.2',
	command: 'stub-mcp',
	args: ['--stdio'],
	...over,
});

describe('ServerEntrySchema <-> registry contract', () => {
	it('keeps schema keys aligned with the registry entry contract', () => {
		expect(Object.keys(ServerEntrySchema.shape).sort()).toEqual(
			Object.keys(REGISTRY_CONTRACT_KEYS).sort(),
		);
	});

	it('propagates eager options into bootEager while false and omitted stay cold', () => {
		const children: FakeChild[] = [];
		const spawner: StdioSpawner = () => {
			const child = new FakeChild(100 + children.length);
			children.push(child);
			return child;
		};
		const registry = new ExternalServerRegistry({
			workspaceRoot: '/fake/workspace',
			spawner,
			servers: {
				eager: ServerEntrySchema.parse(entry({ eager: true })),
				cold: ServerEntrySchema.parse(entry({ eager: false })),
				omitted: ServerEntrySchema.parse(entry()),
			},
		});

		registry.bootEager();

		expect(children).toHaveLength(1);
		const runningById = Object.fromEntries(
			registry.status().map(({ id, running }) => [id, running]),
		);
		expect(runningById).toEqual({
			cold: false,
			eager: true,
			omitted: false,
		});
	});
});
