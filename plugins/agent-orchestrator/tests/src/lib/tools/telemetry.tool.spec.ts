/**
 * `<ns>_classify` / `<ns>_events` handler tests.
 *
 * `InMemoryTelemetrySink` and the `TelemetryEvent` builders are
 * otherwise untouched by any other spec in this plugin — this file is
 * the only place their observable shape (what a host actually reads
 * back from `_events`) is checked.
 */
import { describe, expect, it } from 'vitest';

import { buildReadOnlyToolRegistration } from '../../../../src/lib/tools/telemetry.tool.js';
import { TaskClassifier } from '../../../../src/lib/classifier/task-classifier.js';
import { InMemoryTelemetrySink } from '../../../../src/lib/telemetry/event.js';
import type { ITelemetryEvent } from '../../../../src/lib/telemetry/event.js';

type Handlers = Record<string, (args: unknown) => Promise<unknown>>;

const captureHandlers = async (
	telemetry: InMemoryTelemetrySink,
): Promise<Handlers> => {
	const registration = buildReadOnlyToolRegistration({
		namespacePrefix: 'ns',
		classifier: new TaskClassifier(),
		telemetry,
		policyDefaultMode: () => 'auto',
	});
	const handlers: Handlers = {};
	await registration.register({
		registerTool: (
			name: string,
			_def: unknown,
			fn: (args: unknown) => Promise<unknown>,
		) => {
			handlers[name] = fn;
		},
	} as never);
	return handlers;
};

const structured = (res: unknown): Record<string, unknown> | undefined =>
	(res as { structuredContent?: Record<string, unknown> }).structuredContent;

describe('ns_classify', () => {
	it('returns the classifier verdict and records a classify event', async () => {
		const telemetry = new InMemoryTelemetrySink();
		const handlers = await captureHandlers(telemetry);

		const res = await handlers.ns_classify!({
			id: 't1',
			description: 'Fix typo.',
			tags: [],
			hint: 'trivial',
		});

		expect(structured(res)?.mode).toBe('single');
		const events = telemetry.read();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ kind: 'classify', taskId: 't1' });
	});

	it('classifies a task with no hint without throwing on the optional field', async () => {
		const telemetry = new InMemoryTelemetrySink();
		const handlers = await captureHandlers(telemetry);

		const res = await handlers.ns_classify!({
			id: 't2',
			description: 'Something ambiguous',
			tags: [],
		});

		expect(structured(res)?.mode).toBeDefined();
	});
});

describe('ns_events', () => {
	const seedEvents = (telemetry: InMemoryTelemetrySink): void => {
		const base: Omit<ITelemetryEvent, 'ts' | 'taskId'> = {
			kind: 'classify',
		};
		telemetry.emit({ ...base, ts: 100, taskId: 'a' });
		telemetry.emit({ ...base, ts: 200, taskId: 'b' });
		telemetry.emit({ ...base, ts: 300, taskId: 'c' });
	};

	it('returns all events, most recent first, when no filter is given', async () => {
		const telemetry = new InMemoryTelemetrySink();
		seedEvents(telemetry);
		const handlers = await captureHandlers(telemetry);

		const res = await handlers.ns_events!({});

		const body = structured(res) as {
			events: ITelemetryEvent[];
			total: number;
		};
		expect(body.total).toBe(3);
		expect(body.events.map((e) => e.taskId)).toEqual(['c', 'b', 'a']);
	});

	it('filters to events at or after `since`, while `total` still counts everything', async () => {
		const telemetry = new InMemoryTelemetrySink();
		seedEvents(telemetry);
		const handlers = await captureHandlers(telemetry);

		const res = await handlers.ns_events!({ since: 200 });

		const body = structured(res) as {
			events: ITelemetryEvent[];
			total: number;
		};
		expect(body.events.map((e) => e.taskId)).toEqual(['c', 'b']);
		expect(body.total).toBe(3);
	});

	it('caps the returned events at `limit`, keeping the most recent ones', async () => {
		const telemetry = new InMemoryTelemetrySink();
		seedEvents(telemetry);
		const handlers = await captureHandlers(telemetry);

		const res = await handlers.ns_events!({ limit: 1 });

		const body = structured(res) as {
			events: ITelemetryEvent[];
			total: number;
		};
		expect(body.events.map((e) => e.taskId)).toEqual(['c']);
	});
});
