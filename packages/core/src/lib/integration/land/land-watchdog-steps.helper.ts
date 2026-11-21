/**
 * land-watchdog-steps.helper.ts — the steps that make the scheduled pass a
 * watchdog without crying wolf. A pass that acted while an event-driven pass
 * was in flight raced that event, it did not miss it; a pass that crashed
 * missed nothing. Only a strict pass that exits 1 files the evidence, and it
 * keeps ONE open issue: a later clean strict pass closes it.
 */

import {
	WATCHDOG_EVIDENCE_PATH,
	WATCHDOG_INFLIGHT_RUN,
	WATCHDOG_ISSUE_RUN,
} from './land-watchdog.constant';
import { indentLines as indent } from './land-signal.helper';

type EnvLines = (env: Readonly<Record<string, string>>) => string[];

/** Runs the pass and records its exit code, so a crash is told from a finding. */
const passRun = (passCommand: string): string[] => [
	'rc=0',
	`${passCommand} || rc=$?`,
	'echo "rc=${rc}" >> "${GITHUB_OUTPUT}"',
	'exit "${rc}"',
];

/** The step that looks for an event-driven pass in flight before the watchdog goes strict. */
export const inflightStep = (
	envLines: EnvLines,
	token: Readonly<Record<string, string>>,
): string[] => [
	`- name: Look for an event-driven pass in flight`,
	'  id: inflight',
	`  if: \${{ github.event_name == 'schedule' }}`,
	...envLines(token),
	'  run: |',
	...indent(WATCHDOG_INFLIGHT_RUN, 4),
	'',
];

/** The pass itself: strict only when no event-driven pass was in flight (one that was raced the event, it did not miss it). */
export const watchdogPassStep = (
	envLines: EnvLines,
	token: Readonly<Record<string, string>>,
	passCommand: string,
): string[] => [
	'- name: One pass',
	'  id: pass',
	...envLines({
		...token,
		GITHUB_REPOSITORY: '${{ github.repository }}',
		LAND_WATCHDOG: `\${{ github.event_name == 'schedule' && steps.inflight.outputs.count == '0' && '1' || '' }}`,
		LAND_WATCHDOG_EVIDENCE: WATCHDOG_EVIDENCE_PATH,
	}),
	'  run: |',
	...indent(passRun(passCommand), 4),
	'',
];

/** The step that keeps the one open issue of a missed event. */
export const watchdogIssueStep = (
	envLines: EnvLines,
	token: Readonly<Record<string, string>>,
): string[] => [
	'- name: Keep the one issue of a missed event',
	`  if: \${{ !cancelled() && github.event_name == 'schedule' && steps.inflight.outputs.count == '0' }}`,
	...envLines({
		...token,
		RC: '${{ steps.pass.outputs.rc }}',
		RUN: '${{ github.run_id }}',
		RUN_URL:
			'${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}',
		SHA: '${{ github.sha }}',
		EVIDENCE: WATCHDOG_EVIDENCE_PATH,
	}),
	'  run: |',
	...indent(WATCHDOG_ISSUE_RUN, 4),
];
