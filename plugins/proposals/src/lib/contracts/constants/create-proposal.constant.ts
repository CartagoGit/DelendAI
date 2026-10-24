/**
 * What a refused `create_proposal` says to do. The proposal has no id yet,
 * so the usual advice (enter a unit for the proposal the call names) cannot
 * be followed: the unit is entered for `new`, and the create runs in it.
 */
export const CREATE_PROPOSAL_REFUSED_NEXT_STEP =
	'A new proposal has no id to enter a unit for yet. Enter a unit of kind create for the proposal `new`: `delendai work enter --kind=create --proposal=new --slice=all --topic=<a-few-words> --agent=<you>`, then create the proposal inside the worktree it prints (pass it as `checkout`, or `--workspace=<that worktree>` on the CLI). The unit takes the new proposal’s id when the proposal is created; publish it with `delendai work publish --kind=create --proposal=<id> --slice=all`.';
