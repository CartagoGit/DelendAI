import type { IPluginStateTransitionEvent, ILazyPluginRouter } from './router';
import type { ITransitionReason, PluginState } from './states';

export interface IPluginManager {
	state(pluginId: string): PluginState | undefined;
	hide(pluginId: string, note?: string): PluginState;
	activate(pluginId: string, note?: string): PluginState;
	unload(pluginId: string, note?: string): PluginState;
	deny(pluginId: string, note?: string): PluginState;
	onTransition(
		listener: (event: IPluginStateTransitionEvent) => void,
	): () => void;
}

const reason = (
	trigger: ITransitionReason['trigger'],
	note?: string,
): ITransitionReason => ({
	trigger,
	at: Date.now(),
	...(note === undefined ? {} : { note }),
});

export const createPluginManager = (
	router: Pick<
		ILazyPluginRouter,
		| 'pluginState'
		| 'transitionPlugin'
		| 'onPluginStateTransition'
		| 'isInitialized'
	>,
): IPluginManager => {
	const requireState = (pluginId: string): PluginState =>
		router.pluginState(pluginId) ?? 'UNLOADED';

	return {
		state(pluginId) {
			return router.pluginState(pluginId);
		},
		hide(pluginId, note) {
			const current = requireState(pluginId);
			if (current === 'LOADED_HIDDEN' || current === 'DENIED')
				return current;
			if (current === 'ACTIVE') {
				router.transitionPlugin(
					pluginId,
					'UNLOADED',
					reason('MANAGER_HIDE', note),
				);
			}
			return router.transitionPlugin(
				pluginId,
				'LOADED_HIDDEN',
				reason('MANAGER_HIDE', note),
			);
		},
		activate(pluginId, note) {
			const current = requireState(pluginId);
			if (current === 'DENIED' || current === 'ACTIVE') return current;
			if (current === 'UNLOADED') {
				if (!router.isInitialized()) {
					throw new Error(
						`plugin router must be initialized before activating "${pluginId}"`,
					);
				}
				router.transitionPlugin(
					pluginId,
					'LOADED_HIDDEN',
					reason('MANAGER_ACTIVATE', note),
				);
			}
			return router.transitionPlugin(
				pluginId,
				'ACTIVE',
				reason('MANAGER_ACTIVATE', note),
			);
		},
		unload(pluginId, note) {
			const current = requireState(pluginId);
			if (current === 'DENIED' || current === 'UNLOADED') return current;
			return router.transitionPlugin(
				pluginId,
				'UNLOADED',
				reason('MANAGER_UNLOAD', note),
			);
		},
		deny(pluginId, note) {
			if (requireState(pluginId) === 'DENIED') return 'DENIED';
			return router.transitionPlugin(
				pluginId,
				'DENIED',
				reason('MANAGER_DENY', note),
			);
		},
		onTransition(listener) {
			return router.onPluginStateTransition(listener);
		},
	};
};
