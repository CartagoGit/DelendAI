/**
 * kinds.spec.ts — f00153 S1.
 *
 * Pure tests for the severity taxonomy and the `kind → incidentType`
 * table. The integration is exercised by the `tools.spec.ts`,
 * `incidents-search.spec.ts` and the `index.spec.ts` suites.
 */
import { describe, expect, it } from 'vitest';

import {
	INCIDENT_TYPE_PATTERN,
	isValidIncidentType,
	KIND_TO_INCIDENT_TYPE,
	LOG_SEVERITIES,
	SEVERITY_RANK,
	severityForOutcome,
} from '../src/lib/services/kinds';
import {
	LOG_OUTCOMES,
	normalizeEvent,
} from '../src/lib/services/normalize-event';

describe('severityForOutcome (f00153 S1)', () => {
	it('maps ok and idle to info', () => {
		expect(severityForOutcome('ok')).toBe('info');
		expect(severityForOutcome('idle')).toBe('info');
	});

	it('maps failed and timed-out to error', () => {
		expect(severityForOutcome('failed')).toBe('error');
		expect(severityForOutcome('timed-out')).toBe('error');
	});

	it('maps cancelled to notice and dead to critical', () => {
		expect(severityForOutcome('cancelled')).toBe('notice');
		expect(severityForOutcome('dead')).toBe('critical');
	});

	it('maps unknown to warning', () => {
		expect(severityForOutcome('unknown')).toBe('warning');
	});

	it('is total over LOG_OUTCOMES', () => {
		for (const outcome of LOG_OUTCOMES) {
			expect(LOG_SEVERITIES).toContain(severityForOutcome(outcome));
		}
	});
});

describe('KIND_TO_INCIDENT_TYPE (f00153 S1)', () => {
	it('covers every LogEventKind with a slug-shaped code', () => {
		for (const code of Object.values(KIND_TO_INCIDENT_TYPE)) {
			expect(isValidIncidentType(code)).toBe(true);
		}
	});

	it('exposes tool-failure for tool-failed', () => {
		expect(KIND_TO_INCIDENT_TYPE['tool-failed']).toBe('tool-failure');
	});

	it('exposes state-inconsistency for state-inconsistency-detected', () => {
		expect(KIND_TO_INCIDENT_TYPE['state-inconsistency-detected']).toBe(
			'state-inconsistency',
		);
	});
});

describe('isValidIncidentType (f00153 S2)', () => {
	it('accepts a canonical lower-case slug', () => {
		expect(isValidIncidentType('lock-conflict')).toBe(true);
		expect(isValidIncidentType('tool-failure')).toBe(true);
		expect(isValidIncidentType('a1')).toBe(true);
	});

	it('rejects empty strings, uppercase and special chars', () => {
		expect(isValidIncidentType('')).toBe(false);
		expect(isValidIncidentType('LockConflict')).toBe(false);
		expect(isValidIncidentType('lock_conflict')).toBe(false);
		expect(isValidIncidentType('1leading-digit')).toBe(false);
	});

	it('rejects strings longer than 64 chars', () => {
		expect(isValidIncidentType('a'.repeat(65))).toBe(false);
	});

	it('matches the published regex', () => {
		expect(INCIDENT_TYPE_PATTERN.source).toBe('^[a-z][a-z0-9-]{0,63}$');
	});
});

describe('normalizeEvent populates severity + incidentType (f00153 S1)', () => {
	it('projects severity=error and incidentType=tool-failure for tool-failed', () => {
		const event = normalizeEvent('tool-failed', { toolName: 'foo' });
		expect(event.severity).toBe('error');
		expect(event.incidentType).toBe('tool-failure');
	});

	it('projects severity=critical and incidentType=agent-death for agent-dead', () => {
		const event = normalizeEvent('agent-dead', { agent: 'a1' });
		expect(event.severity).toBe('critical');
		expect(event.incidentType).toBe('agent-death');
	});

	it('projects severity=info and incidentType=server-boot for server-started', () => {
		const event = normalizeEvent('server-started', { taskId: 'pid-1' });
		expect(event.severity).toBe('info');
		expect(event.incidentType).toBe('server-boot');
	});
});

describe('x00153 S7 — kinds.ts doc comment claims 8-level taxonomy', () => {
	it('defines exactly the 8 canonical syslog severities', () => {
		expect(LOG_SEVERITIES.length).toBe(8);
		expect([...LOG_SEVERITIES].sort()).toEqual([
			'alert',
			'critical',
			'debug',
			'emergency',
			'error',
			'info',
			'notice',
			'warning',
		]);
	});

	it('SEVERITY_RANK exposes the operator-facing numeric order', () => {
		// syslog RFC 5424 §6.2.1: 0=emerg .. 7=debug
		expect(SEVERITY_RANK.emergency).toBe(0);
		expect(SEVERITY_RANK.alert).toBe(1);
		expect(SEVERITY_RANK.critical).toBe(2);
		expect(SEVERITY_RANK.error).toBe(3);
		expect(SEVERITY_RANK.warning).toBe(4);
		expect(SEVERITY_RANK.notice).toBe(5);
		expect(SEVERITY_RANK.info).toBe(6);
		expect(SEVERITY_RANK.debug).toBe(7);
	});
});

describe('x00153 S7 — syslog 8-level, not 7-level', () => {
	it('LOG_SEVERITIES has exactly 8 entries (RFC 5424 §6.2.1)', () => {
		expect(LOG_SEVERITIES).toHaveLength(8);
	});

	it('LOG_SEVERITIES covers all 8 named levels alphabetically', () => {
		expect([...LOG_SEVERITIES].sort()).toEqual([
			'alert',
			'critical',
			'debug',
			'emergency',
			'error',
			'info',
			'notice',
			'warning',
		]);
	});

	it('SEVERITY_RANK covers the same 8 levels as LOG_SEVERITIES', () => {
		expect(Object.keys(SEVERITY_RANK).sort()).toEqual(
			[...LOG_SEVERITIES].sort(),
		);
	});
});
