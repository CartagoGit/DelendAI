import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { asWorkItemId, type INewWorkEvent } from '../events/work-event';
import { NdjsonWorkEventStore } from '../events/work-event-store.ndjson';
import type { IObserverEventSink } from './contracts/interfaces/observer.interface';
import { ToolObserver } from './tool-observer.service';

const makeSink = () => {
	const events: INewWorkEvent[] = [];
	return {
		events,
		append: async (event: INewWorkEvent): Promise<void> => {
			events.push(event);
		},
	};
};

const observe = (sink: IObserverEventSink) =>
	new ToolObserver({
		workItemId: asWorkItemId('f00509/S4'),
		actorId: 'agent',
		sink,
		rootDir: '/repo',
	});

const make = () => {
	const sink = makeSink();
	return { sink, observer: observe(sink) };
};

describe('ToolObserver (f00509 S4)', () => {
	it('emits called, finished and error events', async () => {
		const { sink, observer } = make();
		observer.called('read_file', { path: 'a.ts' });
		observer.finished('read_file', { durationMs: 4 });
		observer.failed('read_file', { exitCode: 2, message: 'boom' });
		await observer.idle();
		expect(sink.events.map((e) => e.kind)).toEqual([
			'tool_called',
			'tool_finished',
			'tool_error',
		]);
	});

	it('hashes args independent of key order and ignores secret values', async () => {
		const { sink, observer } = make();
		observer.called('t', { a: 1, b: { y: 2, x: 3 }, apiToken: 'one' });
		observer.called('t', { b: { x: 3, y: 2 }, a: 1, apiToken: 'two' });
		observer.called('t', { a: 2, b: { x: 3, y: 2 } });
		await observer.idle();
		const [first, second, third] = sink.events.map((e) => e.payload_hash);
		expect(first).toBe(second);
		expect(first).not.toBe(third);
	});

	it('drops every secret-looking key regardless of case', async () => {
		const { sink, observer } = make();
		observer.called('t', {
			a: 1,
			Password: 'p',
			Authorization: 'x',
			client_secret: 's',
			ApiKey: 'k',
			credentials: 'c',
		});
		observer.called('t', { a: 1 });
		await observer.idle();
		expect(sink.events[0]?.payload_hash).toBe(sink.events[1]?.payload_hash);
	});

	it('hashes equal errors that differ only in volatile noise', async () => {
		const { sink, observer } = make();
		observer.failed('t', {
			exitCode: 1,
			message: 'fail /repo/a.ts:1:2 (10ms)',
		});
		observer.failed('t', { exitCode: 1, message: 'fail  a.ts:9:9 (77ms)' });
		await observer.idle();
		expect(sink.events[0]?.payload_hash).toBe(sink.events[1]?.payload_hash);
	});

	it('attach/detach symmetry: a no-op sink changes nothing', async () => {
		const args = { a: 1, token: 'x' };
		const before = JSON.stringify(args);
		const observer = new ToolObserver({
			workItemId: asWorkItemId('f00509/S4'),
			actorId: null,
			sink: { append: async () => undefined },
		});
		observer.called('t', args);
		observer.finished('t', { durationMs: 1 });
		await observer.idle();
		expect(JSON.stringify(args)).toBe(before);
	});

	it('lands a 1000-call burst through the NDJSON store in under a second', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'tool-observer-'));
		try {
			const store = new NdjsonWorkEventStore({
				path: join(dir, 'e.ndjson'),
			});
			const observer = observe({
				append: (event: INewWorkEvent) => store.append(event),
			});
			const started = performance.now();
			for (let i = 0; i < 1000; i += 1) observer.called('t', { i });
			await observer.idle();
			expect(performance.now() - started).toBeLessThan(1000);
			expect(await store.list()).toHaveLength(1000);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
