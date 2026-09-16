/**
 * error-sink-adapter.ts — f00251 S4.
 *
 * Bridges the core error-collector to the issues plugin:
 *   - ALWAYS writes a redacted markdown draft under `scaffoldDir/_errors/<fingerprint>.md`
 *   - OPTIONALLY creates a live issue when `autoReport` is enabled AND the
 *     captured error is at severity `critical`, `alert`, or `emergency`.
 *
 * Safe-mode (default, `autoReport: false`): drafts only, no network calls.
 * Live-mode (`autoReport: true`): adds rate-limit + fingerprint dedup guards
 * before calling `githubClient.createIssue`.
 *
 * NEVER throws: all errors are caught, written to stderr, and counted in
 * `githubFailures`.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { realpathContained, writeFileAtomic } from '@delendai/core/public';
import type { ICapturedError, IErrorSink } from '@delendai/core/public';

import type { IIssueCreateInput, IIssueCreateResult } from '../contracts';

// ---------------------------------------------------------------------------
// Severity gate
// ---------------------------------------------------------------------------

const LIVE_SEVERITIES = new Set(['critical', 'alert', 'emergency']);

// ---------------------------------------------------------------------------
// Narrow injectable port — the adapter only needs `createIssue`
// ---------------------------------------------------------------------------

/**
 * The narrow injectable GitHub client port the adapter depends on.
 * Tests stub this without implementing the full fetch/list surface.
 */
export interface IGithubClient {
	/**
	 * Open a new issue. Throws on failure — the adapter catches and
	 * increments `githubFailures`.
	 */
	createIssue(input: IIssueCreateInput): Promise<IIssueCreateResult>;
}

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface ICreateIssuesErrorSinkAdapterOptions {
	/** When undefined, live-issue creation is skipped even when `autoReport` is true. */
	readonly githubClient: IGithubClient | undefined;
	/** Absolute, workspace-contained path. Drafts land in `<scaffoldDir>/_errors/`. */
	readonly scaffoldDir: string;
	/**
	 * Absolute workspace root, used as the PHYSICAL containment root for
	 * draft writes (x00544 S3). Rooting at `scaffoldDir` instead would be
	 * vacuous: realpath-ing a symlinked scaffold dir makes the escape
	 * destination its own root. Optional so older hosts keep working.
	 */
	readonly workspaceRoot?: string;
	readonly clock?: (() => Date) | undefined;
	/** Default `false` — safe-mode, drafts only. */
	readonly autoReport: boolean;
	/** Maximum live issues opened per rolling hour. Default `5`. */
	readonly maxReportsPerHour: number;
}

export interface IIssuesErrorSinkAdapterStats {
	readonly draftsWritten: number;
	readonly liveIssuesOpened: number;
	readonly liveIssuesDropped: number;
	readonly githubFailures: number;
	/**
	 * Draft writes refused because the resolved `_errors` dir physically
	 * left the workspace. Counted rather than silent: this adapter must
	 * never throw, and a refusal nobody can see is indistinguishable
	 * from a sink that quietly stopped working.
	 */
	readonly containmentRefusals: number;
}

export interface IIssuesErrorSinkAdapter {
	readonly sink: IErrorSink;
	readonly getStats: () => IIssuesErrorSinkAdapterStats;
}

// ---------------------------------------------------------------------------
// Draft serialisation
// ---------------------------------------------------------------------------

/**
 * One table cell, whatever the summary contains.
 *
 * The pipe was escaped and the newline was not — and a summary is the
 * one field here that comes from a thrown error's own message. A
 * newline in it ended the row and turned the rest of the message into
 * what looks like another field of the incident report.
 */
const escapeCell = (value: string): string =>
	value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const buildDraftContent = (event: ICapturedError): string => {
	const fm = [
		'---',
		`id: ${event.fingerprint}`,
		`kind: incident`,
		`severity: ${event.severity}`,
		`errorCode: ${event.errorCode}`,
		`toolName: ${event.toolName}`,
		`pluginName: ${event.pluginName}`,
		`packageId: ${event.packageId}`,
		`classification: ${event.classification}`,
		`capturedAt: ${event.ts}`,
		`draftVersion: 1`,
		'---',
	].join('\n');

	const table = [
		'| Field | Value |',
		'| --- | --- |',
		`| severity | ${event.severity} |`,
		`| classification | ${event.classification} |`,
		`| errorCode | ${event.errorCode} |`,
		`| toolName | ${event.toolName} |`,
		`| pluginName | ${event.pluginName} |`,
		`| packageId | ${event.packageId} |`,
		`| fingerprint | ${event.fingerprint} |`,
		`| summary | ${escapeCell(event.summary)} |`,
	].join('\n');

	return [
		fm,
		'',
		'## Incident report',
		'',
		table,
		'',
		'> **Disable**: set `plugins.issues.options.autoReport: false` in your config file to stop live issue creation.',
	].join('\n');
};

const buildIssueBody = (event: ICapturedError): string => {
	const table = [
		'| Field | Value |',
		'| --- | --- |',
		`| severity | ${event.severity} |`,
		`| classification | ${event.classification} |`,
		`| errorCode | ${event.errorCode} |`,
		`| toolName | ${event.toolName} |`,
		`| pluginName | ${event.pluginName} |`,
		`| packageId | ${event.packageId} |`,
		`| fingerprint | ${event.fingerprint} |`,
		`| summary | ${escapeCell(event.summary)} |`,
	].join('\n');

	return [
		'## Incident report',
		'',
		table,
		'',
		'> **Disable**: set `plugins.issues.options.autoReport: false` in your config file to stop live issue creation.',
	].join('\n');
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createIssuesErrorSinkAdapter = (
	options: ICreateIssuesErrorSinkAdapterOptions,
): IIssuesErrorSinkAdapter => {
	const clock = options.clock ?? (() => new Date());

	let draftsWritten = 0;
	let liveIssuesOpened = 0;
	let liveIssuesDropped = 0;
	let githubFailures = 0;
	let containmentRefusals = 0;

	/** `fingerprint → timestamp of last successful live-create` */
	const fingerprintLastSeen = new Map<string, number>();
	/** Sliding window of live-issue creation timestamps (for rate-limit). */
	const hourWindow: number[] = [];

	const HOUR_MS = 60 * 60 * 1000;
	const errorsDir = join(options.scaffoldDir, '_errors');

	const record = async (event: ICapturedError): Promise<void> => {
		try {
			// x00544 S3: PHYSICAL containment immediately before the write.
			// `scaffoldDir` is lexically contained at register time, but a
			// symlinked scaffold dir still names another tree and only
			// realpath can see that. This adapter's contract is that it
			// NEVER throws, so a refusal is a counted, logged skip.
			const containmentRoot =
				options.workspaceRoot ?? options.scaffoldDir;
			if (!(await realpathContained(errorsDir, [containmentRoot]))) {
				containmentRefusals++;
				process.stderr.write(
					'[issues-error] refusing to write a draft outside the workspace\n',
				);
				return;
			}
			// Always write a draft first.
			await mkdir(errorsDir, { recursive: true });
			const draftPath = join(errorsDir, `${event.fingerprint}.md`);
			await writeFileAtomic(draftPath, buildDraftContent(event));
			draftsWritten++;

			// Live-issue gate: only when autoReport + severity qualifies + client present.
			if (
				!options.autoReport ||
				options.githubClient === undefined ||
				!LIVE_SEVERITIES.has(event.severity)
			) {
				return;
			}

			const now = clock().getTime();

			// Fingerprint dedup: skip if the same fingerprint was reported recently.
			const lastSeen = fingerprintLastSeen.get(event.fingerprint);
			if (lastSeen !== undefined && now - lastSeen < HOUR_MS) {
				liveIssuesDropped++;
				return;
			}

			// Rate-limit: evict stale entries then check cap.
			const cutoff = now - HOUR_MS;
			while (hourWindow.length > 0 && (hourWindow[0] ?? 0) < cutoff) {
				hourWindow.shift();
			}
			if (hourWindow.length >= options.maxReportsPerHour) {
				liveIssuesDropped++;
				return;
			}

			// Open the live issue.
			try {
				await options.githubClient.createIssue({
					title: `incident: ${event.toolName} — ${event.severity}`,
					body: buildIssueBody(event),
					labels: ['incident'],
				});
				liveIssuesOpened++;
				fingerprintLastSeen.set(event.fingerprint, now);
				hourWindow.push(now);
			} catch (err) {
				githubFailures++;
				process.stderr.write(
					`[issues-error] createIssue failed: ${err instanceof Error ? err.message : String(err)}\n`,
				);
			}
		} catch (err) {
			githubFailures++;
			process.stderr.write(
				`[issues-error] record failed: ${err instanceof Error ? err.message : String(err)}\n`,
			);
		}
	};

	const sink: IErrorSink = {
		id: 'issues-error',
		record,
	};

	const getStats = (): IIssuesErrorSinkAdapterStats => ({
		draftsWritten,
		liveIssuesOpened,
		liveIssuesDropped,
		githubFailures,
		containmentRefusals,
	});

	return { sink, getStats };
};
