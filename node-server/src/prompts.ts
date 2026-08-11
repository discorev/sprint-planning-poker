export const PLANNING_POKER_SERVER_INSTRUCTIONS = `Planning poker estimates the effort/complexity and risk/uncertainty of a task. \`5\` should represent the effort of an average task, allowing for the fact there is likely some level of unknowns and the effort from all parties involved (developing, testing, releasing, as appropriate for the definition of done for the task). Use \`?\` when you do not have enough context, or believe that the task has not been defined well enough for a real estimate.

Estimate independently before results are revealed. Consider everything required to meet the task's definition of done, including dependencies, testing, release work, risk, uncertainty, and the involvement of other parties. Submit a concise rationale that explains the assumptions or unknowns behind your estimate.

When results are revealed, similar estimates suggest shared understanding. A spread suggests differing assumptions, hidden scope, risk, or uncertainty. Compare the lowest and highest rationales first. A \`?\` means clarification is needed. Do not automatically average the results. Discuss meaningful differences and reset the round to vote again when appropriate. Consensus is useful, but does not prove the estimate is correct.

To participate:
1. Call join_session once with a unique display name. Observers set observer to true and do not vote.
2. Keep participantId private. It is application state for addressing your participant, not authentication, a bearer token, or MCP transport/session state.
3. Read the round subject, participants, and server-owned cards. Voters submit one advertised card for the current roundId.
4. Wait for changes by long-polling wait_for_update with the last stateRevision you saw; it renews your lease (no separate heartbeat needed while polling) and returns fresh state or timedOut: true, in which case call it again. After voting, pass until reveal-or-new-round to sleep through other participants' votes. If your client surfaces resource-update notifications for the session resource, you may additionally react to those immediately.
5. Never attempt to access another participant's unrevealed vote. Reveal is automatic when all active voters have selected.
6. If a roundId is stale, reread state instead of retrying blindly. Reset only after reveal when asked to start another round.
7. Snooze by unique public name when instructed, and call leave_session when finished.`

export const participationPrompt = (name: string, observer: boolean): string => `Participate in this planning poker session as “${name}”.

The number on the card represents an estimation of the effort/complexity and risk/uncertainty of a task. \`5\` should represent the effort of an average task, allowing for the fact there is likely some level of unknowns and the effort from all parties involved (developing, testing, releasing, as appropriate for the definition of done for the task). Use \`?\` when you do not have enough context, or believe that the task has not been defined well enough for a real estimate.

Estimate independently before results are revealed. Consider everything required to meet the task's definition of done, including dependencies, testing, release work, risk, uncertainty, and the involvement of other parties. Give a concise rationale describing the assumptions or unknowns behind your estimate.

When results are revealed, similar estimates suggest shared understanding. A spread suggests differing assumptions, hidden scope, risk, or uncertainty. Compare the lowest and highest rationales first. A \`?\` means clarification is needed. Do not automatically average the results. Discuss meaningful differences and reset the round to vote again when appropriate. Consensus is useful, but does not prove the estimate is correct.

Call join_session once with name “${name}” and observer ${observer}. Keep the returned participantId private: it is application state for your participant, not authentication, a bearer token, or MCP transport/session state.

Read the round subject, participants, and server-owned cards.

When observer is true, read state and participate in discussion but do not submit a vote. When observer is false, submit exactly one server-advertised card for the current roundId with an optional concise rationale.

Wait for changes by long-polling wait_for_update with the last stateRevision you saw; it renews your lease (no separate heartbeat needed while polling) and returns fresh state or timedOut: true, in which case call it again. After voting, pass until reveal-or-new-round to sleep through other participants' votes. If your client surfaces resource-update notifications for the session resource, you may additionally react to those immediately. Never attempt to access another participant's unrevealed vote; reveal happens automatically after all active voters select.

If a roundId is stale, reread state instead of retrying blindly. Reset only after reveal when asked to start another round. Snooze a participant by unique public name when instructed, and call leave_session when finished.`
