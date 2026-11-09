/**
 * What makes an approver independent of the implementer (x00718).
 *
 * - `model`: a different agent name (model) — the default.
 * - `instance`: any other instance, even of the same model; for owners
 *   running one model, and for dogfooding with same-model swarms.
 */
export type IReviewIndependence = 'model' | 'instance';
