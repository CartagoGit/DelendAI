/**
 * The implementer of a delivery nothing in Git names (x00646 S5).
 *
 * A round is still opened and the review goes ahead — a delivery whose
 * author was never recorded is not left in review for ever — but the
 * slice says so, and says that independence could not be verified. The
 * name is reserved: no reviewer may use it.
 */
export const UNRECORDED_IMPLEMENTER = 'unrecorded';

/**
 * What an approval line carries when the tool saw that its reviewer and
 * the implementer, one model, were two instances. A document cannot show
 * an instance, so without it the same model's approval proves nothing.
 */
export const ANOTHER_INSTANCE_MARK = '[another instance]';
