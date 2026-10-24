/**
 * host-supervisor.spec.ts — the host keeps its connection while the server
 * behind it moves onto new code (x00756).
 */
import { describe, expect, it } from 'vitest';

import { createHostSupervisor } from './host-supervisor';
import type { ISupervisedChild } from './host-supervisor.interface';

interface IFakeChild extends ISupervisedChild {
	readonly received: string[];
	readonly emit: (message: object) => void;
	readonly exit: (code: number | null) => void;
	stopped: boolean;
}

const fakeChild = (
	answerInitialize: boolean,
	capabilities: object = { tools: { listChanged: true } },
): IFakeChild => {
	const lines: ((line: string) => void)[] = [];
	const exits: ((code: number | null) => void)[] = [];
	const received: string[] = [];
	const child: IFakeChild = {
		received,
		stopped: false,
		send: (line) => {
			received.push(line);
			const message = JSON.parse(line) as {
				id?: unknown;
				method?: string;
			};
			if (answerInitialize && message.method === 'initialize') {
				child.emit({
					jsonrpc: '2.0',
					id: message.id,
					result: { capabilities },
				});
			}
		},
		onLine: (listener) => {
			lines.push(listener);
		},
		onExit: (listener) => {
			exits.push(listener);
		},
		stop: () => {
			child.stopped = true;
		},
		emit: (message) => {
			for (const listener of lines) listener(JSON.stringify(message));
		},
		exit: (code) => {
			for (const listener of exits) listener(code);
		},
	};
	return child;
};

const setup = (next: (index: number) => IFakeChild) => {
	const children: IFakeChild[] = [];
	const toHost: object[] = [];
	const logs: string[] = [];
	const timers: (() => void)[] = [];
	const supervisor = createHostSupervisor({
		spawn: () => {
			const child = next(children.length);
			children.push(child);
			return child;
		},
		toHost: (line) => toHost.push(JSON.parse(line)),
		log: (line) => logs.push(line),
		setTimer: (run) => {
			timers.push(run);
			return { cancel: () => undefined };
		},
	});
	const connect = (): void => {
		supervisor.fromHost(
			JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { protocolVersion: '2025-06-18' },
			}),
		);
		supervisor.fromHost(
			JSON.stringify({
				jsonrpc: '2.0',
				method: 'notifications/initialized',
			}),
		);
	};
	return { supervisor, children, toHost, logs, timers, connect };
};

describe('the host supervisor', () => {
	it('relays both ways', () => {
		const { supervisor, children, toHost, connect } = setup(() =>
			fakeChild(true),
		);
		connect();
		supervisor.fromHost(
			JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
		);
		children[0]?.emit({ jsonrpc: '2.0', id: 2, result: { tools: [] } });
		expect(
			children[0]?.received.map((line) => JSON.parse(line).method),
		).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
		expect(toHost).toContainEqual({
			jsonrpc: '2.0',
			id: 2,
			result: { tools: [] },
		});
	});

	it('refuses to restart before a host has connected', async () => {
		const { supervisor } = setup(() => fakeChild(true));
		expect(await supervisor.restart()).toEqual({
			restarted: false,
			reason: 'not-connected',
		});
	});

	it('moves to a new server that replays the handshake, and tells the host its lists changed', async () => {
		const { supervisor, children, toHost, connect } = setup(() =>
			fakeChild(true),
		);
		connect();
		expect(await supervisor.restart()).toEqual({ restarted: true });
		const [old, fresh] = children;
		expect(old?.stopped).toBe(true);
		expect(fresh?.received.map((line) => JSON.parse(line).method)).toEqual([
			'initialize',
			'notifications/initialized',
		]);
		// The replayed answer is the supervisor's, not the host's.
		expect(toHost.filter((m) => 'result' in m)).toHaveLength(1);
		expect(toHost).toContainEqual({
			jsonrpc: '2.0',
			method: 'notifications/tools/list_changed',
		});
		supervisor.fromHost(
			JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
		);
		expect(fresh?.received.at(-1)).toContain('tools/list');
		expect(old?.received.some((line) => line.includes('"id":3'))).toBe(
			false,
		);
	});

	it('waits for the old server to answer what it holds, and holds new requests until the switch', async () => {
		const { supervisor, children, toHost, connect } = setup(() =>
			fakeChild(true),
		);
		connect();
		supervisor.fromHost(
			JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call' }),
		);
		const restarting = supervisor.restart();
		await Promise.resolve();
		await Promise.resolve();
		supervisor.fromHost(
			JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list' }),
		);
		expect(children[0]?.stopped).toBe(false);
		children[0]?.emit({ jsonrpc: '2.0', id: 7, result: { done: true } });
		expect(await restarting).toEqual({ restarted: true });
		expect(toHost).toContainEqual({
			jsonrpc: '2.0',
			id: 7,
			result: { done: true },
		});
		expect(
			children[0]?.received.some((line) => line.includes('"id":8')),
		).toBe(false);
		expect(children[1]?.received.at(-1)).toContain('"id":8');
	});

	it('keeps the current server when the new one does not start', async () => {
		const { supervisor, children, logs, timers, connect } = setup((index) =>
			fakeChild(index === 0),
		);
		connect();
		const restarting = supervisor.restart();
		for (const run of timers) run();
		expect(await restarting).toEqual({
			restarted: false,
			reason: 'did-not-start',
		});
		expect(children[0]?.stopped).toBe(false);
		expect(children[1]?.stopped).toBe(true);
		expect(logs.join('\n')).toContain('keeps running');
	});

	it('answers what a dead server held with an error, and starts it again', async () => {
		const { supervisor, children, toHost, connect } = setup(() =>
			fakeChild(true),
		);
		connect();
		supervisor.fromHost(
			JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call' }),
		);
		children[0]?.exit(1);
		await Promise.resolve();
		await Promise.resolve();
		expect(toHost).toContainEqual(
			expect.objectContaining({ id: 9, error: expect.anything() }),
		);
		expect(children).toHaveLength(2);
		expect(children[1]?.received[0]).toContain('initialize');
	});
});
