import { memo } from 'react';
import type { Player } from '../protocol';
import { THEMES, type Theme } from '../theme';

interface TableStatusProps {
  readonly name: string;
  readonly players: readonly Player[];
  readonly showReset: boolean;
}

export const TableStatus = memo(function TableStatus({ name, players, showReset }: TableStatusProps) {
  const participants = players.filter((player) => !player.observer);
  if (showReset) {
    const disconnected = participants.filter((player) => player.disconnected).map((player) => player.name);
    return (
      <section className="table-status" role="status">
        Votes are on the table.
        {disconnected.length > 0 ? <>{' '}<em>{disconnected.join(', ')}</em> left after voting — their card stays this round.</> : null}
      </section>
    );
  }

  const eligible = participants.filter((player) => !player.snoozed);
  const voted = eligible.filter((player) => player.selected).length;
  const pending = eligible.filter((player) => !player.selected).map((player) => player.name === name ? 'you' : player.name);
  const snoozed = participants.filter((player) => player.snoozed).map((player) => player.name);

  return (
    <section className="table-status" role="status">
      <em>{voted} of {eligible.length}</em> votes in
      {pending.length > 0 ? <> · waiting for {pending.join(', ')}</> : null}
      {snoozed.length > 0 ? <> · {snoozed.join(', ')} snoozed</> : null}
    </section>
  );
});

interface RevealStripProps {
  readonly players: readonly Player[];
  readonly theme: Theme;
}

export const RevealStrip = memo(function RevealStrip({ players, theme }: RevealStripProps) {
  const votes = players.flatMap((player) => player.choice === undefined ? [] : [player.choice]);
  const tally = new Map<string, number>();
  for (const vote of votes) {
    tally.set(vote, (tally.get(vote) ?? 0) + 1);
  }
  const mostPicked = [...tally].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '—';
  const numericVotes = votes.map(Number).filter(Number.isFinite);
  const spread = numericVotes.length === 0
    ? '—'
    : Math.min(...numericVotes) === Math.max(...numericVotes)
      ? String(Math.min(...numericVotes))
      : `${Math.min(...numericVotes)} – ${Math.max(...numericVotes)}`;
  const consensus = votes.length >= 2 && votes.every((vote) => vote === votes[0]);

  return (
    <section aria-label="Round result" className="reveal-strip">
      <div className="stat"><span className="stat-label">Most picked</span><span className="stat-value">{mostPicked}</span></div>
      <div className="stat"><span className="stat-label">Spread</span><span className="stat-value">{spread}</span></div>
      <div className="stat"><span className="stat-label">Votes</span><span className="stat-value">{votes.length}</span></div>
      {consensus ? <div className="consensus-flag">{THEMES[theme].consensus}</div> : null}
    </section>
  );
});
