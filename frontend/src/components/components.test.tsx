import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardDeck } from './CardDeck';
import { ConnectionModal } from './ConnectionModal';
import { PlayerCard } from './PlayerCard';
import { Register } from './Register';

describe('Register', () => {
  it('validates the name, captures observer mode, and submits', async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn<(name: string) => void>();
    const onObserverChange = vi.fn<(observer: boolean) => void>();
    const onRegister = vi.fn<() => void>();

    function RegisterHarness() {
      const [name, setName] = useState('');
      const [observer, setObserver] = useState(false);
      return (
        <Register
          name={name}
          observer={observer}
          submitted={false}
          onDismissError={() => undefined}
          onNameChange={(nextName) => {
            onNameChange(nextName);
            setName(nextName);
          }}
          onObserverChange={(nextObserver) => {
            onObserverChange(nextObserver);
            setObserver(nextObserver);
          }}
          onRegister={onRegister}
        />
      );
    }

    render(<RegisterHarness />);

    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Al');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'i');
    expect(onNameChange).toHaveBeenLastCalledWith('Ali');
    expect(submit).toBeEnabled();
    await user.click(screen.getByLabelText('Observer mode'));
    await user.click(submit);

    expect(onObserverChange).toHaveBeenCalledWith(true);
    expect(onRegister).toHaveBeenCalledOnce();
  });

  it('shows and dismisses registration errors', async () => {
    const user = userEvent.setup();
    const onDismissError = vi.fn<() => void>();
    render(
      <Register
        error="name is already taken"
        name="Alice"
        observer={false}
        submitted={false}
        onDismissError={onDismissError}
        onNameChange={() => undefined}
        onObserverChange={() => undefined}
        onRegister={() => undefined}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Failed! name is already taken');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismissError).toHaveBeenCalledOnce();
  });
});

describe('CardDeck', () => {
  it('renders server-provided cards in order and toggles choices through the parent', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn<(choice: string) => void>();
    const cards = ['server-small', 'server-medium', 'server-large'];
    render(<CardDeck cards={cards} disabled={false} onChoose={onChoose} selection="server-medium" />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(cards);
    const chosen = screen.getByRole('button', { name: 'server-medium' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen).toHaveClass('bg-white', 'text-[#212529]', 'border-[#007bff]');
    expect(chosen).not.toHaveClass('bg-[#007bff]', 'text-white');
    await user.click(chosen);
    expect(onChoose).toHaveBeenCalledWith('server-medium');
  });

  it('locks every choice after reveal', () => {
    render(<CardDeck cards={['1', '2']} disabled onChoose={() => undefined} />);
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });
});

describe('PlayerCard', () => {
  it('shows selection, choice, and snooze controls', async () => {
    const user = userEvent.setup();
    const onSnooze = vi.fn<(name: string) => void>();
    const { container } = render(
      <PlayerCard
        onSnooze={onSnooze}
        player={{ name: 'Alice', type: 'user', choice: '8', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: false }}
      />,
    );

    expect(container.querySelector('.player-choice')).toHaveClass('border-[#007bff]');
    expect(screen.getByText('active player').parentElement).toHaveClass('text-[#d8d8d8]');
    expect(screen.getByText('active player').parentElement).not.toHaveClass('text-fuchsia-500');
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.queryByText(/rationale:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /snooze player Alice/i }));
    expect(onSnooze).toHaveBeenCalledWith('Alice');
  });

  it('shows a rationale icon when a player provides one', () => {
    render(
      <PlayerCard
        onSnooze={() => undefined}
        player={{ name: 'Alice', type: 'agent', choice: '8', rationale: 'Touches storage', selected: true, snoozed: false, observer: false, disconnected: false }}
      />,
    );

    expect(screen.getByTitle('Touches storage')).toBeInTheDocument();
    expect(screen.getByText('rationale: Touches storage')).toBeInTheDocument();
  });

  it('shows snoozed players and lets them be woken', async () => {
    const user = userEvent.setup();
    const onSnooze = vi.fn<(name: string) => void>();
    render(
      <PlayerCard
        onSnooze={onSnooze}
        player={{ name: 'Bob', type: 'user', choice: undefined, rationale: undefined, selected: false, snoozed: true, observer: false, disconnected: false }}
      />,
    );

    expect(screen.getByText('snoozed player').parentElement).toHaveClass('text-fuchsia-500');
    expect(screen.getByText('snoozed player').parentElement).not.toHaveClass('text-[#d8d8d8]');
    await user.click(screen.getByRole('button', { name: /un-snooze player Bob/i }));
    expect(onSnooze).toHaveBeenCalledWith('Bob');
  });

  it('shows a disconnected marker instead of snooze and renders no button', () => {
    render(
      <PlayerCard
        onSnooze={() => undefined}
        player={{ name: 'Ghost', type: 'user', choice: '5', rationale: undefined, selected: true, snoozed: false, observer: false, disconnected: true }}
      />,
    );

    expect(screen.getByText('disconnected player Ghost')).toBeInTheDocument();
    expect(screen.getByText('disconnected player Ghost').parentElement).toHaveClass('text-red-500');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the observer marker instead of snooze', () => {
    render(
      <PlayerCard
        onSnooze={() => undefined}
        player={{ name: 'Observer', type: 'user', choice: undefined, rationale: undefined, selected: false, snoozed: false, observer: true, disconnected: false }}
      />,
    );
    expect(screen.getByText('observer')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('labels participants as ai or human user for screen readers', () => {
    const { rerender } = render(
      <PlayerCard
        onSnooze={() => undefined}
        player={{ name: 'Agent', type: 'agent', choice: undefined, rationale: undefined, selected: false, snoozed: false, observer: false, disconnected: false }}
      />,
    );
    expect(screen.getByText('ai player')).toBeInTheDocument();
    expect(screen.queryByText('human player')).not.toBeInTheDocument();

    rerender(
      <PlayerCard
        onSnooze={() => undefined}
        player={{ name: 'Human', type: 'user', choice: undefined, rationale: undefined, selected: false, snoozed: false, observer: false, disconnected: false }}
      />,
    );
    expect(screen.getByText('human player')).toBeInTheDocument();
    expect(screen.queryByText('ai player')).not.toBeInTheDocument();
  });
});

describe('ConnectionModal', () => {
  it('blocks the interface while disconnected', () => {
    const { rerender } = render(<ConnectionModal connected={false} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Connecting...');
    rerender(<ConnectionModal connected />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
