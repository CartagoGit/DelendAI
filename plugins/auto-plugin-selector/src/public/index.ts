export { default } from '../index';
export { recommendPlugins } from '../lib/score/recommend-plugins';
export { buildConfigDiff } from '../lib/apply/config-diff';
export type {
	IPluginCandidate,
	IPluginFit,
	IProjectSignals,
	IRecommendPluginsOptions,
} from '../lib/contracts/interfaces/plugin-fit.interface';
export type {
	IConfigDiff,
	IConfigDiffStep,
} from '../lib/contracts/interfaces/config-diff.interface';
