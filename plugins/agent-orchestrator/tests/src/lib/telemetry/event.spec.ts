/**
 * `InMemoryTelemetrySink` and the `TelemetryEvent` builders — otherwise
 * exercised only indirectly (via `ns_classify`, see telemetry.tool.spec.ts).
 * `dispatchStart`/`dispatchEnd`/`rotate`/`plan` are not currently wired
 * into any dispatcher (a real gap noted separately), but they are a
 * public, typed contract: a future caller composing these events must
 * get the documented shape, so their pure output is worth pinning here.
 */
import { describe, expect, it } from 'vitest';

import {
	InMemoryTelemetrySink,
	TelemetryEvent,
} from '../../../../src/lib/telemetry/event.js';
import type { IClassificationVerdict } from '../../../../src/lib/classifier/task-classifier.js';
import type { IModePlan, ITask } from '../../../../src/lib/policy/types.js';

const TASK: ITask = { id: 't1', description: 'x', tags: [] };

describe('InMemoryTelemetrySink', () => {
	it('reads back events in emission order', () => {
		const sink = new InMemoryTelemetrySink();
		sink.emit({ ts: 1, kind: 'classify', taskId: 'a' });
		sink.emit({ ts: 2, kind: 'classify', taskId: 'b' });
		expect(sink.read().map((e) => e.taskId)).toEqual(['a', 'b']);
	});

	it('evicts the oldest event once capacity is exceeded', () => {
		const sink = new InMemoryTelemetrySink(2);
		sink.emit({ ts: 1, kind: 'classify', taskId: 'a' });
		sink.emit({ ts: 2, kind: 'classify', taskId: 'b' });
		sink.emit({ ts: 3, kind: 'classify', taskId: 'c' });
		expect(sink.read().map((e) => e.taskId)).toEqual(['b', 'c']);
	});

	it('reset() clears the buffer', () => {
		const sink = new InMemoryTelemetrySink();
		sink.emit({ ts: 1, kind: 'classify', taskId: 'a' });
		sink.reset();
		expect(sink.read()).toEqual([]);
	});
});

describe('TelemetryEvent.plan', () => {
	const plan = (mode: IModePlan['mode'], rationale = 'r'): IModePlan => ({
		mode,
		rationale,
		steps: [],
		budget: {
			maxTokensOrchestrator: 1,
			maxTokensPerSubagent: 1,
			timeoutMs: 0,
		},
		rotation: { maxIterationsPerSubagent: 1, allow: [] },
	});
	const verdict: IClassificationVerdict = {
		mode: 'linear',
		reason: 'because',
		confidence: 0.7,
	};

	it('carries innerMode/confidence when the mode is not auto and a verdict is supplied', () => {
		const event = TelemetryEvent.plan(TASK, plan('linear'), verdict);
		expect(event).toMatchObject({
			kind: 'plan',
			taskId: 't1',
			innerMode: 'linear',
			confidence: 0.7,
			evidence: 'r',
		});
	});

	it('omits innerMode/confidence when the mode is auto, even with a verdict', () => {
		const event = TelemetryEvent.plan(TASK, plan('auto'), verdict);
		expect(event).not.toHaveProperty('innerMode');
		expect(event).not.toHaveProperty('confidence');
	});

	it('omits innerMode/confidence when no verdict is supplied, even for a non-auto mode', () => {
		const event = TelemetryEvent.plan(TASK, plan('linear'));
		expect(event).not.toHaveProperty('innerMode');
		expect(event).not.toHaveProperty('confidence');
	});
});

describe('TelemetryEvent.classify / dispatchStart / dispatchEnd / rotate', () => {
	it('classify carries the verdict mode, confidence and reason', () => {
		const verdict: IClassificationVerdict = {
			mode: 'swarm',
			reason: 'fan-out detected',
			confidence: 0.4,
		};
		const event = TelemetryEvent.classify(TASK, verdict);
		expect(event).toMatchObject({
			kind: 'classify',
			taskId: 't1',
			innerMode: 'swarm',
			confidence: 0.4,
			evidence: 'fan-out detected',
		});
	});

	it('dispatchStart carries only the taskId', () => {
		const event = TelemetryEvent.dispatchStart('t1');
		expect(event.kind).toBe('dispatch.start');
		expect(event.taskId).toBe('t1');
	});

	it('dispatchEnd marks evidence "ok" on success', () => {
		const event = TelemetryEvent.dispatchEnd('t1', true, 42);
		expect(event).toMatchObject({
			kind: 'dispatch.end',
			taskId: 't1',
			tokensUsed: 42,
			evidence: 'ok',
		});
	});

	it('dispatchEnd marks evidence "failed" on failure', () => {
		const event = TelemetryEvent.dispatchEnd('t1', false, 0);
		expect(event.evidence).toBe('failed');
	});

	it('rotate formats evidence as "<subagentId>: <reason>"', () => {
		const event = TelemetryEvent.rotate(
			't1',
			'slot-1-implementer#2',
			'error-storm',
		);
		expect(event).toMatchObject({
			kind: 'rotate',
			taskId: 't1',
			evidence: 'slot-1-implementer#2: error-storm',
		});
	});
});
