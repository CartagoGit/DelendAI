/**
 * config-runtime-schema.constant.ts — the blocks of `delendai.config.json`
 * that describe how the SERVER behaves.
 *
 * The startup report, the managed surface, the evidence store, the state
 * engine, the cache and the loop detector are one question — "what does
 * this server do, and how loudly?" — and they were declared inside the
 * config file's own schema. That file grew past the point where a reader
 * could hold it in their head, and the block a person was looking for was
 * buried between two dozen keys that had nothing to do with it.
 *
 * Split out, the file that names the project stays about the project,
 * and this one is about the runtime. The shape is unchanged: every block
 * here is the same schema, moved.
 */
import { z } from 'zod';

import { documentedEnum } from './config-schema-docs';
import {
	CACHE_RUN_ON_BOOT_DOCS,
	EVIDENCE_CLEANUP_DOCS,
	MANAGED_SURFACE_LOADING_DOCS,
	STARTUP_REPORT_COLOR_DOCS,
	STARTUP_REPORT_LEVEL_DOCS,
} from '../contracts/constants/config-schema-docs.constant';
import { STARTUP_REPORT_LEVEL_INPUTS } from '../startup-report/level';

export const StartupReport = z
	.object({
		level: documentedEnum(
			STARTUP_REPORT_LEVEL_INPUTS,
			STARTUP_REPORT_LEVEL_DOCS,
		)
			.optional()
			.describe(
				'How much of the startup report to print. Defaults to `medium` — the plugin table, the token accounting and the warnings. Raise it to `full` while chasing a slow or expensive boot, lower it to `off` to print nothing.',
			),
		color: documentedEnum(
			['auto', 'always', 'never'],
			STARTUP_REPORT_COLOR_DOCS,
		)
			.optional()
			.describe(
				'Whether the startup report is coloured. `auto` colours it only when the output is a terminal; set `never` when a CI log parses the output.',
			),
	})
	.strict()
	.optional()
	.describe(
		'The operator-facing report printed when the server starts: what loaded and what it cost. Use it to keep a noisy startup quiet, or to make it verbose while debugging a slow boot.',
	);

export const ManagedSurface = z
	.object({
		loading: documentedEnum(['lazy', 'eager'], MANAGED_SURFACE_LOADING_DOCS)
			.optional()
			.describe(
				'When a managed plugin is loaded. `lazy` loads it on first use, so startup is fast and the first call pays a small delay; `eager` loads everything at startup, which costs startup time but removes the delay. Change it when the first call must be as fast as the rest.',
			),
		// Read by `assemble.ts` and typed in `load-config-file.ts`, but
		// missing here — so a workspace that set it got a config
		// diagnostic for an option the runtime honours.
		progressiveDisclosure: z
			.boolean()
			.optional()
			.describe(
				'Let `native` mode hide the tools a plugin marks as contextual or administrative from `tools/list`, while keeping them callable through the router. Off by default, because a host that chose `native` may never call the router; turn it on to shrink the listed surface.',
			),
		idleTtlMs: z
			.number()
			.int()
			.nonnegative()
			.nullable()
			.optional()
			.describe(
				'How long (milliseconds) a plugin may sit unused before it leaves the warm set. `null` disables the bound, so a warm plugin stays warm for the whole session. Lower it to release memory sooner; raise it when plugins are evicted between calls.',
			),
		maxWarmPlugins: z
			.number()
			.int()
			.nonnegative()
			.nullable()
			.optional()
			.describe(
				'How many plugins may be warm at once; `null` means no limit. Lower it to cap the memory a long session holds, raise it when a busy session keeps evicting plugins it is about to need again.',
			),
		minWarmMs: z
			.number()
			.int()
			.nonnegative()
			.nullable()
			.optional()
			.describe(
				'How long (milliseconds) a freshly warmed plugin is protected from eviction by idle time or by the warm-set limit; `null` removes the floor. Use it when a plugin is expensive to load and the session must not thrash it.',
			),
	})
	.strict()
	.optional()
	.describe(
		'How the managed surface loads plugins and how long it keeps them warm. Use it to trade startup speed against the latency of the first call, or to cap the memory a long session holds.',
	);

export const EvidenceSchema = z
	.object({
		retentionDays: z
			.number()
			.int()
			.min(1)
			.optional()
			.describe(
				'How many days of evidence to keep before it becomes eligible for removal. Defaults to 30. Lower it when the evidence store grows too large, raise it when a later investigation needs the older records.',
			),
		cleanup: documentedEnum(
			['on-boot', 'dry-run', 'off'],
			EVIDENCE_CLEANUP_DOCS,
		)
			.optional()
			.describe(
				'When expired evidence is swept. `on-boot` sweeps while the server starts, `dry-run` reports what would go without deleting anything, `off` never sweeps and the evidence accumulates until you remove it yourself.',
			),
	})
	.strict()
	.optional()
	.describe(
		'How long the runtime keeps the evidence it records — tool results, sweep reports — and when it sweeps. Use it to control how much the evidence store grows.',
	);

// The state engine. `parity.shadow.enabled` (default off) runs the
// SQLite driver beside the in-memory one and samples their parity.
export const StateSchema = z
	.object({
		parity: z
			.object({
				shadow: z
					.object({
						enabled: z
							.boolean()
							.optional()
							.describe(
								'Run the SQLite driver beside the in-memory one and sample whether they agree, so a divergence shows up before it is trusted. Off by default — nothing loads the second driver unless you turn it on. Turn it on while changing the state engine.',
							),
					})
					.strict()
					.optional()
					.describe(
						'Runs the SQLite driver beside the in-memory one and samples whether the two agree.',
					),
			})
			.strict()
			.optional()
			.describe(
				'How the two state drivers are compared with each other.',
			),
	})
	.strict()
	.optional()
	.describe('How the state engine stores and checks its data.');

// Cache eviction policy. Without this block the boot sweep applies
// the owners' rules (`runOnBoot: 'apply'`); `'dry-run'` reports
// without deleting, `'off'` skips it.
export const CacheSchema = z
	.object({
		runOnBoot: documentedEnum(
			['dry-run', 'apply', 'off'],
			CACHE_RUN_ON_BOOT_DOCS,
		)
			.optional()
			.describe(
				'What the boot-time sweep does. `apply` removes what the cache owners’ rules say is expendable, `dry-run` reports without deleting anything, `off` skips the sweep entirely.',
			),
		evictionIntervalMs: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe(
				'The shortest time between two boot sweeps, in milliseconds. `0` (or absent) sweeps on every boot; set it to a day or more when the cache is large enough that a restart should not pay for another walk.',
			),
		maxAgeDays: z
			.number()
			.optional()
			.describe(
				'The upper cap, in days, applied to every age-based eviction rule. Defaults to 30. Lower it to keep the cache shorter-lived — it can shorten the built-in lifetimes but never lengthen them.',
			),
		worktrees: z
			.object({
				enabled: z
					.boolean()
					.optional()
					.describe(
						'Ignored. Kept so an older configuration still validates: work units are removed by the work-reap command, and the sweep never touches the worktree directory.',
					),
				keepLastN: z
					.number()
					.optional()
					.describe(
						'Ignored. Kept so an older configuration still validates.',
					),
			})
			.strict()
			.optional()
			.describe(
				'Accepted for compatibility and ignored: work units are removed by the work-reap command, and the sweep never touches the worktree directory.',
			),
	})
	.strict()
	.optional()
	.describe('How the cache under `cacheDir` is swept at start-up.');

export const LoopdetectorSchema = z
	.object({
		enabled: z
			.boolean()
			.optional()
			.describe(
				'Whether the loop detector runs at all. Off means a stuck agent is never flagged.',
			),
		repeatThreshold: z
			.number()
			.optional()
			.describe(
				'How many times the same tool may be called in a row before the agent is treated as stuck. Defaults to 8 — high enough that a person’s repeated orientation calls are not flagged.',
			),
		nearRepeatThreshold: z
			.number()
			.optional()
			.describe(
				'How many calls to nearly the same tool (the same tool with different arguments) count as a loop. Defaults to 5, below the exact-repeat threshold so near-repeats are caught first.',
			),
		similarityThreshold: z
			.number()
			.optional()
			.describe(
				'How similar two calls must be, from 0 to 1, to count as near-repeats. Defaults to 0.9; lower it to catch calls that differ more.',
			),
		idleThreshold: z
			.number()
			.optional()
			.describe(
				'How many consecutive calls that do nothing are treated as a stall. Defaults to 3.',
			),
		noProgressThreshold: z
			.number()
			.optional()
			.describe(
				'How many consecutive rounds without a change to the work count as no progress. Defaults to 3; lower it to catch a stalled agent sooner.',
			),
		ringSize: z
			.number()
			.optional()
			.describe(
				'How many recent calls the detector keeps in memory to compare against. Defaults to 50. Raise it when the agent’s cycle is longer than the window.',
			),
		gitCheckTools: z
			.array(z.string())
			.optional()
			.describe(
				'The tools whose repeated use counts as a loop. Defaults to the file-editing tools, which is where a stuck agent spins; extend it when the agent stalls on another tool.',
			),
		handoffDir: z
			.string()
			.optional()
			.describe(
				'Where the detector writes the handoff note it leaves for a stuck agent. Relative to the workspace root; it defaults to a directory under `cacheDir`.',
			),
		handoffTtlDays: z
			.number()
			.optional()
			.describe(
				'How many days a handoff note is kept before it is swept. Defaults to 7.',
			),
		notifyOnDetect: z
			.boolean()
			.optional()
			.describe(
				'Whether the detector tells the person when it detects a loop. Turn it off in an unattended run, where the notification would only be noise.',
			),
		interactiveAgentPatterns: z
			.array(z.string())
			.optional()
			.describe(
				'Agents the detector must ignore, by name or wildcard. Defaults to the patterns a host reports its one user-facing session under (`*-default`, `default-*`, `host`, `interactive`), because a person legitimately repeats the same call. Set it to `[]` to watch every agent.',
			),
	})
	.strict()
	.optional()
	.describe(
		'How the server notices an agent that is stuck in a loop instead of making progress. Read by the workflow plugin; a project that does not use it never sees this.',
	);
