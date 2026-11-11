/**
 * webhook-forward.service.spec.ts — `gh webhook forward` is the connection
 * out: ready when the extension says so, refused when it dies first, closed
 * when it dies later, and the secret never appears in a reason.
 *
 * The child process is a fake; the loopback listener is real, because what
 * it promises (loopback only, an answer before the handler runs) is about
 * what an HTTP server does.
 */

import { describe, expect, it } from 'vitest';

import {
	createGhWebhookForwardTransport,
	ghForwardArgs,
	listenOnLoopback,
} from '../src/lib/webhook-forward.service';

import type { IForgeEventDelivery } from '@delendai/forge/public';
import type {
	IForwardChild,
	IForwardListen,
} from '../src/lib/contracts/interfaces/webhook-forward.interface';

interface IFakeChild extends IForwardChild {
	say: (text: string) => void;
	exit: (code: number | null) => void;
	killed: boolean;
}

const fakeChild = (): IFakeChild => {
	const outputs: Array<(chunk: string) => void> = [];
	const exits: Array<(code: number | null) => void> = [];
	const child: IFakeChild = {
		killed: false,
		onOutput: (listener) => {
			outputs.push(listener);
		},
		onExit: (listener) => {
			exits.push(listener);
		},
		kill: () => {
			child.killed = true;
		},
		say: (text) => {
			for (const listener of outputs) listener(text);
		},
		exit: (code) => {
			for (const listener of exits) listener(code);
		},
	};
	return child;
};

const setup = () => {
	const child = fakeChild();
	const spawned: Array<readonly string[]> = [];
	let listenerClosed = false;
	let deliver: ((delivery: IForgeEventDelivery) => void) | undefined;
	const listen: IForwardListen = async (onDelivery) => {
		deliver = onDelivery;
		return {
			port: 4321,
			close: async () => {
				listenerClosed = true;
			},
		};
	};
	const waits: Array<{ run: () => void; cancelled: boolean }> = [];
	const transport = createGhWebhookForwardTransport({
		repository: 'octo/repo',
		spawn: (args) => {
			spawned.push(args);
			return child;
		},
		listen,
		delay: (run) => {
			const wait = { run, cancelled: false };
			waits.push(wait);
			return () => {
				wait.cancelled = true;
			};
		},
	});
	return {
		child,
		spawned,
		waits,
		transport,
		deliver: (delivery: IForgeEventDelivery) => deliver?.(delivery),
		listenerClosed: () => listenerClosed,
	};
};

const flush = async (): Promise<void> => {
	for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('ghForwardArgs', () => {
	it('[<5ms] forwards the mapped events to the loopback listener', () => {
		expect(ghForwardArgs('octo/repo', 4321, 's')).toEqual([
			'webhook',
			'forward',
			'--repo=octo/repo',
			'--events=push,pull_request,check_run,pull_request_review,issues',
			'--url=http://127.0.0.1:4321/',
			'--secret=s',
		]);
	});
});

describe('createGhWebhookForwardTransport', () => {
	it('[<10ms] is ready when the extension says it forwards, and hands deliveries over', async () => {
		const t = setup();
		const delivered: IForgeEventDelivery[] = [];
		const closed: string[] = [];
		const opening = t.transport.open({
			secret: 'per-connection',
			onDelivery: (delivery) => delivered.push(delivery),
			onClosed: (reason) => closed.push(reason),
		});
		await flush();
		expect(t.spawned[0]).toContain('--secret=per-connection');
		t.child.say('Forwarding Webhook events from GitHub...\n');
		const connection = await opening;
		expect(t.waits[0]?.cancelled).toBe(true);
		t.deliver({ headers: { 'x-github-event': 'push' }, body: '{}' });
		expect(delivered).toHaveLength(1);

		t.child.say('Error: error receiving json event: per-connection\n');
		t.child.exit(1);
		expect(closed).toEqual([
			'gh exited 1: Error: error receiving json event: ***',
		]);
		await flush();
		expect(t.listenerClosed()).toBe(true);
		await connection.close();
	});

	it('[<10ms] rejects when gh dies before it is ready, with the secret masked', async () => {
		const t = setup();
		const opening = t.transport.open({
			secret: 'hidden',
			onDelivery: () => undefined,
			onClosed: () => undefined,
		});
		await flush();
		t.child.say('error creating webhook: HTTP 404 for --secret=hidden\n');
		t.child.exit(1);
		await expect(opening).rejects.toThrow(
			'gh exited 1: error creating webhook: HTTP 404 for --secret=***',
		);
		expect(t.child.killed).toBe(true);
	});

	it('[<10ms] rejects when gh cannot start, and when it never says ready', async () => {
		const missing = setup();
		const opening = missing.transport.open({
			secret: 's',
			onDelivery: () => undefined,
			onClosed: () => undefined,
		});
		await flush();
		missing.child.exit(null);
		await expect(opening).rejects.toThrow('gh could not start');

		const silent = setup();
		const waiting = silent.transport.open({
			secret: 's',
			onDelivery: () => undefined,
			onClosed: () => undefined,
		});
		await flush();
		silent.waits[0]?.run();
		await expect(waiting).rejects.toThrow('said nothing ready');
		expect(silent.child.killed).toBe(true);
	});

	it('[<10ms] closing it kills gh and reports no close of its own', async () => {
		const t = setup();
		const closed: string[] = [];
		const opening = t.transport.open({
			secret: 's',
			onDelivery: () => undefined,
			onClosed: (reason) => closed.push(reason),
		});
		await flush();
		t.child.say('Forwarding Webhook events from GitHub...');
		const connection = await opening;
		await connection.close();
		t.child.exit(0);
		expect(t.child.killed).toBe(true);
		expect(closed).toEqual([]);
	});
});

describe('listenOnLoopback', () => {
	it('[<300ms] binds loopback, answers 202 and passes headers and body', async () => {
		const received: IForgeEventDelivery[] = [];
		const listener = await listenOnLoopback((delivery) =>
			received.push(delivery),
		);
		try {
			const response = await fetch(
				`http://127.0.0.1:${String(listener.port)}/`,
				{
					method: 'POST',
					headers: { 'X-GitHub-Event': 'push' },
					body: '{"a":1}',
				},
			);
			expect(response.status).toBe(202);
			expect(received[0]?.body).toBe('{"a":1}');
			expect(received[0]?.headers['x-github-event']).toBe('push');
		} finally {
			await listener.close();
		}
	});
});
