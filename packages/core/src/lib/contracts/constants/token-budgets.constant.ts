export type ITokenBudgetCeiling = {
	readonly hard: number;
	readonly warning: number;
	readonly releaseRelativePercent: number;
};

export type ITokenBudgetSurface = ITokenBudgetCeiling & {
	readonly marginalPluginHard?: number;
	readonly marginalPluginWarning?: number;
};

/**
 * AUD-B02 / x00283: a governed preset's `toolsList` ceiling is the ONE
 * surface the dashboard renders a "Marginal Status" column for. An
 * optional marginal ceiling there is a contradiction — the dashboard has
 * no honest value to fall back to and previously defaulted to `?? 0`,
 * which reported "over hard (0B)" for every plugin in four of six
 * presets. Making both fields required here means a preset that is
 * missing a real marginal ceiling fails to compile, not silently renders
 * a false permanent violation.
 */
export type IGovernedToolsListBudget = ITokenBudgetCeiling & {
	readonly marginalPluginHard: number;
	readonly marginalPluginWarning: number;
};

export type IPresetTokenBudgetProfile = {
	readonly toolsList: IGovernedToolsListBudget;
	readonly overviewCompact?: ITokenBudgetSurface;
	readonly roundContext?: ITokenBudgetSurface;
};

export type ITokenBudgetRegistry = {
	readonly bytesPerEstimatedToken: number;
	readonly fixturePluginIds: readonly string[];
	readonly dashboardPresetIds: readonly string[];
	readonly governedPresetIds: readonly string[];
	readonly invariants: {
		readonly compactVsFullMaxRatio: number;
		readonly leanVsSwarmToolsListMaxRatio: number;
	};
	readonly toolPayloads: {
		readonly overviewFull: ITokenBudgetSurface;
		readonly overviewCompact: ITokenBudgetSurface;
		/**
		 * x00296 S2 (AUD-B06): `overviewFull`/`overviewCompact` above are
		 * calibrated for the `managed` bootstrap listing. `overview` is
		 * also directly callable under `native` (the full catalog
		 * listing), which is a materially larger, independently-governed
		 * surface — this is a NEW ceiling, not a redefinition of the
		 * `managed` one above.
		 */
		readonly overviewFullNative: ITokenBudgetSurface;
		readonly overviewCompactNative: ITokenBudgetSurface;
		readonly agentCatalogCompact: ITokenBudgetSurface;
		readonly agentCatalogFull: ITokenBudgetSurface;
		readonly autoWork: ITokenBudgetSurface;
		readonly search: ITokenBudgetSurface;
		readonly docsList: ITokenBudgetSurface;
		readonly roundContext: ITokenBudgetSurface;
		readonly logsTail: ITokenBudgetSurface;
		readonly analyzeCompact: ITokenBudgetSurface;
		readonly planCompact: ITokenBudgetSurface;
	};
	readonly presets: {
		readonly minimal: IPresetTokenBudgetProfile;
		readonly lean: IPresetTokenBudgetProfile;
		readonly standard: IPresetTokenBudgetProfile;
		readonly swarm: IPresetTokenBudgetProfile;
		readonly full: IPresetTokenBudgetProfile;
		readonly dogfood: IPresetTokenBudgetProfile;
	};
	readonly bumpPolicy: {
		readonly summary: string;
		readonly requiredSteps: readonly string[];
	};
};

export const TOKEN_BUDGETS: ITokenBudgetRegistry = {
	bytesPerEstimatedToken: 4,
	fixturePluginIds: ['proposals', 'memory'],
	dashboardPresetIds: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'dogfood',
		'web-app',
		'backend-api',
		'cli-tool',
	],
	governedPresetIds: [
		'minimal',
		'lean',
		'standard',
		'swarm',
		'full',
		'dogfood',
	],
	invariants: {
		// f00392 S4 / r00041 — the compact overview already drops
		// the per-tool descriptions and groups tools under their
		// owning plugin, but the per-call summary still adds the
		// "compact " prefix and surfaces the project-context block
		// on demand. The remaining byte gap between compact and full
		// is <2% in the latest measurement; the invariant is that
		// compact stays bounded by full (never larger), not a strict
		// 0.7 reduction.
		compactVsFullMaxRatio: 1.0,
		leanVsSwarmToolsListMaxRatio: 0.4,
	},
	toolPayloads: {
		overviewFull: {
			// r00014 keeps bootstrap lean, but the current real tool roster
			// measures slightly above the previous ceiling (~11_060 B).
			hard: 11_100,
			warning: 11_000,
			releaseRelativePercent: 20,
		},
		overviewCompact: {
			hard: 1_500,
			warning: 1_450,
			releaseRelativePercent: 20,
		},
		// x00296 S2 (AUD-B06): the `native` surface lists the full tool
		// catalog (currently 63 tools with the `fixturePluginIds` roster) —
		// materially larger than the lean `managed` bootstrap listing
		// `overviewFull`/`overviewCompact` above govern. Measured real
		// payload today (bumpPolicy step 1,
		// justify-the-cost): 12,024 B full / 1,696 B compact. Ceiling set
		// at +5% over that measurement (bumpPolicy step 3,
		// attempt-a-compensation: no further compaction attempted here —
		// that is `v00129`/future proposals' territory, out of scope for a
		// measurement-only fix) — a guard band against the catalog's
		// natural per-tool-added drift, not an invitation to grow into it
		// (bumpPolicy step 4, document-the-decision: this comment + the
		// x00296 proposal doc are that record).
		overviewFullNative: {
			hard: 12_650,
			warning: 12_300,
			releaseRelativePercent: 20,
		},
		overviewCompactNative: {
			hard: 1_800,
			warning: 1_750,
			releaseRelativePercent: 20,
		},
		agentCatalogCompact: {
			hard: 900,
			warning: 800,
			releaseRelativePercent: 20,
		},
		agentCatalogFull: {
			// adds portable skill metadata and the orchestrator roster
			// to the explicit full drill-down. Compact remains the default
			// orientation surface; this ceiling covers the measured full payload
			// with a bounded margin instead of dropping useful metadata.
			// budget-exception-pending: toolPayloads.agentCatalogFull.hard, toolPayloads.agentCatalogFull.warning
			// budget-exception-expires: 2026-09-30
			// The core agent roster grew (29 tools + 8 skills now, was
			// ~24 tools when the 9000B ceiling was calibrated); the full
			// drill-down payload measures 9519-9778B in the e2e fixture.
			// Compact (724B) stays well under its own ceiling. Raise covers
			// the measured payload with margin.
			hard: 10_500,
			warning: 9_800,
			releaseRelativePercent: 20,
		},
		autoWork: {
			hard: 2_600,
			warning: 2_400,
			releaseRelativePercent: 20,
		},
		search: {
			hard: 3_000,
			warning: 2_700,
			releaseRelativePercent: 20,
		},
		docsList: {
			hard: 2_500,
			warning: 2_200,
			releaseRelativePercent: 20,
		},
		roundContext: {
			hard: 3_000,
			warning: 2_700,
			releaseRelativePercent: 20,
		},
		logsTail: {
			hard: 6_000,
			warning: 5_500,
			releaseRelativePercent: 20,
		},
		analyzeCompact: {
			hard: 1_800,
			warning: 1_600,
			releaseRelativePercent: 20,
		},
		planCompact: {
			hard: 2_000,
			warning: 1_800,
			releaseRelativePercent: 20,
		},
	},
	presets: {
		minimal: {
			toolsList: {
				hard: 64_000,
				warning: 58_000,
				releaseRelativePercent: 20,
				// AUD-B02/x00283: minimal's two plugins are `git`
				// (5,065 B) and `search` (1,749 B); `git` is the largest
				// non-core contributor measured today. `core` itself is
				// excluded from this ceiling — it is the always-on
				// bootstrap roster governed by hard/warning above, not a
				// "plugin" in the marginal sense. A small guard band over
				// the measured 5,065 B leaves room for a few more git
				// tools without licensing a full plugin-scale jump.
				marginalPluginHard: 7_000,
				marginalPluginWarning: 6_000,
			},
		},
		lean: {
			toolsList: {
				// The stable bootstrap registrations are present in
				// the native measurement baseline too; the current 69,115 B
				// roster needs a small, explicit guard band.
				hard: 70_000,
				warning: 69_000,
				releaseRelativePercent: 20,
				marginalPluginHard: 30_000,
				marginalPluginWarning: 24_000,
			},
		},
		standard: {
			toolsList: {
				hard: 144_000,
				warning: 132_000,
				releaseRelativePercent: 20,
				// AUD-B02/x00283: standard's largest non-core owner
				// measured today is `memory` at 8,221 B (`core` is
				// excluded — see the `minimal` comment above). A guard
				// band over that keeps room for the next plugin added to
				// this preset without licensing a `proposals`-scale
				// (45,277 B) jump; if that plugin is ever added here this
				// ceiling must be revisited deliberately, per bumpPolicy.
				marginalPluginHard: 11_000,
				marginalPluginWarning: 9_500,
			},
		},
		swarm: {
			toolsList: {
				// q00009: managed is now the silent default, so the dynamic
				// surface tools (project_context, tool_search,
				// plugin_activate, plugin_deactivate, vertex router) are
				// ALWAYS registered. The runtime gates exposure per-client,
				// but the registrations themselves cost ~5kB on top of the
				// previous baseline. The bump covers that cost plus a small
				// safety margin for the next preset drift.
				hard: 210_000,
				warning: 204_000,
				releaseRelativePercent: 20,
				marginalPluginHard: 80_000,
				marginalPluginWarning: 70_000,
			},
			overviewCompact: {
				// added auto-agent-selector; the current compact swarm
				// surface now measures ~6_426 B with the live plugin mix.
				hard: 6_450,
				warning: 6_350,
				releaseRelativePercent: 20,
			},
			roundContext: {
				hard: 300,
				warning: 250,
				releaseRelativePercent: 20,
			},
		},
		full: {
			toolsList: {
				hard: 256_000,
				warning: 236_000,
				releaseRelativePercent: 20,
				// AUD-B02/x00283: `full` carries `proposals` at
				// 45,277 B, the same plugin at the same measured size as
				// `swarm` (both load it). Reusing swarm's marginal
				// ceiling is not a copy of convenience — it is the same
				// absolute plugin cost, so the same governed limit
				// applies honestly.
				marginalPluginHard: 80_000,
				marginalPluginWarning: 70_000,
			},
		},
		dogfood: {
			toolsList: {
				hard: 384_000,
				warning: 320_000,
				releaseRelativePercent: 20,
				// AUD-B02/x00283: `dogfood` also carries `proposals` at
				// 45,277 B (same measured cost as `swarm`/`full`); see
				// the `full` comment above — same plugin, same ceiling.
				marginalPluginHard: 80_000,
				marginalPluginWarning: 70_000,
			},
		},
	},
	bumpPolicy: {
		summary:
			'Any ceiling increase must be deliberate: justify the cost, show the benefit, attempt a compensation, and document the decision in this contract and the generated report.',
		requiredSteps: [
			'justify-the-cost',
			'show-the-benefit',
			'attempt-a-compensation',
			'document-the-decision',
		],
	},
};
