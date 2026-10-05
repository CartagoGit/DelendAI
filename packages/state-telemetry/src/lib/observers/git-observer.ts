/**
 * git-observer.ts — publishes to the Work Event Bus what git itself can
 * tell after a write or a commit: the changed paths, the branch and the
 * diff stat. Only the sha256 of that canonical projection travels on the
 * wire (see `IWorkEvent.payload_hash`).
 *
 * Contract:
 * - `notify()` is fire-and-forget: it returns at once and the caller
 *   never awaits git.
 * - At most one observation is in flight. Requests that arrive meanwhile
 *   fold into a single repetition when the running one ends.
 * - `git` is only ever asked to read (`status`, `diff`, `show`,
 *   `rev-parse`), asynchronously, and is killed after `timeoutMs`; a
 *   timeout emits `git_change_stale`.
 * - A failing git (not a repository, missing binary) emits nothing, and
 *   nothing ever throws into the caller.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import type { INewWorkEvent, IWorkItemId } from '../events/work-event';

/** Budget for one observation before it is declared stale. */
export const GIT_OBSERVER_TIMEOUT_MS = 250;

export type TGitTrigger = 'write' | 'commit';

export interface IGitEventSink {
	append(event: INewWorkEvent): Promise<unknown>;
}

export interface IGitObserverOptions {
	/** Directory git runs in; each observer only ever sees its own. */
	readonly cwd: string;
	readonly workItemId: IWorkItemId;
	readonly actorId: string | null;
	readonly sink: IGitEventSink;
	readonly timeoutMs?: number;
	/** Git executable; overridable so tests can simulate a slow git. */
	readonly gitBinary?: string;
	readonly now?: () => number;
}

export interface IGitObservation {
	readonly trigger: TGitTrigger;
	readonly branch: string;
	readonly paths: readonly string[];
	readonly diffStat: string;
}

type TGitRun =
	| { readonly ok: true; readonly stdout: string }
	| {
			readonly ok: false;
			readonly timedOut: boolean;
	  };

/** sha256 of the canonical JSON projection of an observation. */
export const hashGitObservation = (observation: IGitObservation): string =>
	createHash('sha256')
		.update(
			JSON.stringify({
				trigger: observation.trigger,
				branch: observation.branch,
				paths: [...observation.paths].sort(),
				diffStat: observation.diffStat,
			}),
		)
		.digest('hex');

const hashStale = (trigger: TGitTrigger): string =>
	createHash('sha256')
		.update(JSON.stringify({ trigger, stale: true }))
		.digest('hex');

/** `--porcelain` lines are `XY path` or `XY old -> new`; keep the new path. */
export const parsePorcelainPaths = (stdout: string): string[] =>
	stdout
		.split('\n')
		.filter((line) => line.length > 3)
		.map((line) => line.slice(3).split(' -> ').pop() ?? '')
		.filter((path) => path.length > 0);

const splitLines = (stdout: string): string[] =>
	stdout.split('\n').filter((line) => line.length > 0);

export class GitObserver {
	private inFlight: Promise<void> | undefined;
	private pending: TGitTrigger | undefined;
	private readonly timeoutMs: number;
	private readonly gitBinary: string;
	private readonly now: () => number;

	constructor(private readonly options: IGitObserverOptions) {
		this.timeoutMs = options.timeoutMs ?? GIT_OBSERVER_TIMEOUT_MS;
		this.gitBinary = options.gitBinary ?? 'git';
		this.now = options.now ?? Date.now;
	}

	/** Ask for an observation. Never awaits, never throws. */
	notify(trigger: TGitTrigger = 'write'): void {
		if (this.inFlight !== undefined) {
			this.pending = trigger;
			return;
		}
		this.inFlight = this.drain(trigger);
	}

	/** Resolves once nothing is running or queued. Meant for tests and shutdown. */
	async idle(): Promise<void> {
		while (this.inFlight !== undefined) await this.inFlight;
	}

	private async drain(first: TGitTrigger): Promise<void> {
		let trigger: TGitTrigger | undefined = first;
		while (trigger !== undefined) {
			try {
				await this.observe(trigger);
			} catch {
				// An observation failing must never reach the caller.
			}
			trigger = this.pending;
			this.pending = undefined;
		}
		this.inFlight = undefined;
	}

	private async observe(trigger: TGitTrigger): Promise<void> {
		const branchRun = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']);
		if (!branchRun.ok) {
			if (branchRun.timedOut)
				await this.emit('git_change_stale', hashStale(trigger));
			return;
		}
		const [pathsRun, statRun] =
			trigger === 'commit'
				? await Promise.all([
						this.git(['show', '--name-only', '--format=', 'HEAD']),
						this.git(['show', '--stat', '--format=', 'HEAD']),
					])
				: await Promise.all([
						this.git(['status', '--porcelain']),
						this.git(['diff', '--stat', 'HEAD']),
					]);
		if (!pathsRun.ok || !statRun.ok) {
			if (
				(pathsRun.ok === false && pathsRun.timedOut) ||
				(statRun.ok === false && statRun.timedOut)
			) {
				await this.emit('git_change_stale', hashStale(trigger));
			}
			return;
		}
		const observation: IGitObservation = {
			trigger,
			branch: branchRun.stdout.trim(),
			paths:
				trigger === 'commit'
					? splitLines(pathsRun.stdout)
					: parsePorcelainPaths(pathsRun.stdout),
			diffStat: statRun.stdout.trim(),
		};
		await this.emit('git_change', hashGitObservation(observation));
	}

	private async emit(
		kind: 'git_change' | 'git_change_stale',
		payloadHash: string,
	): Promise<void> {
		await this.options.sink.append({
			work_item_id: this.options.workItemId,
			actor_id: this.options.actorId,
			kind,
			payload_hash: payloadHash,
			created_at: this.now(),
		});
	}

	private git(args: readonly string[]): Promise<TGitRun> {
		return new Promise((resolve) => {
			let settled = false;
			let timedOut = false;
			let stdout = '';
			const finish = (run: TGitRun): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(run);
			};
			let child: ReturnType<typeof spawn>;
			try {
				child = spawn(this.gitBinary, [...args], {
					cwd: this.options.cwd,
					stdio: ['ignore', 'pipe', 'ignore'],
				});
			} catch {
				resolve({ ok: false, timedOut: false });
				return;
			}
			const timer = setTimeout(() => {
				timedOut = true;
				child.kill('SIGKILL');
				finish({ ok: false, timedOut: true });
			}, this.timeoutMs);
			child.stdout?.setEncoding('utf8');
			child.stdout?.on('data', (chunk: string) => {
				stdout += chunk;
			});
			child.on('error', () => finish({ ok: false, timedOut }));
			child.on('close', (code) =>
				finish(
					code === 0 ? { ok: true, stdout } : { ok: false, timedOut },
				),
			);
		});
	}
}
