import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Player } from '../protocol';
import { CardDeck } from './CardDeck';
import { ConnectionModal } from './ConnectionModal';
import { PlayerCard } from './PlayerCard';
import { Register } from './Register';
import { RoundSubject } from './RoundSubject';
import { ThemeToggle } from './ThemeToggle';

const basePlayer: Player = {
  name: 'Alice',
  type: 'user',
  choice: undefined,
  rationale: undefined,
  selected: false,
  snoozed: false,
  observer: false,
  disconnected: false,
};

function playerCard(player: Player, onSnooze: (name: string) => void = () => undefined, showReset = false) {
  return <PlayerCard index={0} isYou={false} onSnooze={onSnooze} player={player} showReset={showReset} theme="felt" />;
}

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
          submitted={false}
          theme="felt"
        />
      );
    }

    render(<RegisterHarness />);
    const submit = screen.getByRole('button', { name: 'Take a seat' });
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
        onDismissError={onDismissError}
        onNameChange={() => undefined}
        onObserverChange={() => undefined}
        onRegister={() => undefined}
        submitted={false}
        theme="felt"
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
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(cards);
    const chosen = screen.getByRole('button', { name: 'server-medium' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen).toHaveClass('card', 'selected');
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
    const { container } = render(playerCard({ ...basePlayer, choice: '8', selected: true }, onSnooze));
    expect(container.querySelector('.player')).toHaveClass('voted');
    expect(screen.getByRole('button', { name: /snooze player Alice/i })).not.toHaveClass('active');
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.queryByText(/rationale:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /snooze player Alice/i }));
    expect(onSnooze).toHaveBeenCalledWith('Alice');
  });

  it('shows a rationale button and accessible text after reveal', () => {
    render(playerCard({ ...basePlayer, type: 'agent', choice: '8', rationale: 'Touches storage', selected: true }, undefined, true));
    expect(screen.getByTitle('Touches storage')).toBeInTheDocument();
    expect(screen.getByText('rationale: Touches storage')).toBeInTheDocument();
  });

  it('shows snoozed players and lets them be woken', async () => {
    const user = userEvent.setup();
    const onSnooze = vi.fn<(name: string) => void>();
    const { container } = render(playerCard({ ...basePlayer, name: 'Bob', snoozed: true }, onSnooze));
    expect(container.querySelector('.player')).toHaveClass('snoozed');
    expect(screen.getByRole('button', { name: /un-snooze player Bob/i })).toHaveClass('active');
    await user.click(screen.getByRole('button', { name: /un-snooze player Bob/i }));
    expect(onSnooze).toHaveBeenCalledWith('Bob');
  });

  it('shows a disconnected marker instead of snooze and renders no button', () => {
    const { container } = render(playerCard({ ...basePlayer, name: 'Ghost', choice: '5', selected: true, disconnected: true }));
    expect(container.querySelector('.player')).toHaveClass('disconnected');
    expect(screen.getByText('left')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the observer marker instead of snooze', () => {
    render(playerCard({ ...basePlayer, name: 'Observer', observer: true }));
    expect(screen.getByText('observer')).toBeInTheDocument();
    expect(screen.getByText('watching')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('labels participants as ai or human user for screen readers', () => {
    const { rerender } = render(playerCard({ ...basePlayer, name: 'Agent', type: 'agent' }));
    expect(screen.getByText('ai player')).toBeInTheDocument();
    expect(screen.queryByText('human player')).not.toBeInTheDocument();
    rerender(playerCard({ ...basePlayer, name: 'Human' }));
    expect(screen.getByText('human player')).toBeInTheDocument();
    expect(screen.queryByText('ai player')).not.toBeInTheDocument();
  });
});

describe('RoundSubject', () => {
  it('renders the server value and commits an edit on Enter', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(subject: string) => void>();
    render(<RoundSubject onCommit={onCommit} subject="Login flow" />);
    const input = screen.getByPlaceholderText('What are we estimating?');
    expect(input).toHaveValue('Login flow');
    await user.clear(input);
    await user.type(input, 'Signup flow{Enter}');
    expect(onCommit).toHaveBeenCalledWith('Signup flow');
  });

  it('commits on blur and skips the callback when nothing changed', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(subject: string) => void>();
    render(<><RoundSubject onCommit={onCommit} subject="Login flow" /><button type="button">elsewhere</button></>);
    const input = screen.getByPlaceholderText('What are we estimating?');
    await user.click(input);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(onCommit).not.toHaveBeenCalled();
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Signup flow');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(onCommit).toHaveBeenCalledWith('Signup flow');
  });

  it('does not clobber a focused draft when the server value changes', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(subject: string) => void>();
    const { rerender } = render(<RoundSubject onCommit={onCommit} subject="Login flow" />);
    const input = screen.getByPlaceholderText('What are we estimating?');
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Mid-edit draft');
    rerender(<RoundSubject onCommit={onCommit} subject="Server update" />);
    expect(input).toHaveValue('Mid-edit draft');
    expect(input).toHaveFocus();
  });
});

describe('ThemeToggle', () => {
  it('offers and toggles the opposite theme', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn<() => void>();
    render(<ThemeToggle onToggle={onToggle} theme="felt" />);
    await user.click(screen.getByRole('button', { name: 'Switch to Night theme' }));
    expect(onToggle).toHaveBeenCalledOnce();
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
