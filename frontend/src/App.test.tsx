import type { Dispatch } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppAction } from './state/app-state';

const socketMock = vi.hoisted(() => ({
  dispatch: undefined as Dispatch<AppAction> | undefined,
  register: vi.fn<(name: string, observer: boolean) => void>(),
  send: vi.fn(),
}));

vi.mock('./socket/use-planning-poker-socket', () => ({
  usePlanningPokerSocket: (dispatch: Dispatch<AppAction>) => {
    socketMock.dispatch = dispatch;
    return { register: socketMock.register, send: socketMock.send };
  },
}));

vi.mock('./celebrate', () => ({ celebrate: vi.fn() }));

import { App } from './App';
import { celebrate } from './celebrate';

function dispatch(action: AppAction): void {
  act(() => socketMock.dispatch?.(action));
}

beforeEach(() => {
  socketMock.dispatch = undefined;
  socketMock.register.mockClear();
  socketMock.send.mockClear();
  vi.mocked(celebrate).mockClear();
});

describe('App', () => {
  it('registers, toggles a card, reveals a matching round, and resets', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('dialog')).toHaveTextContent('Connecting...');
    dispatch({ type: 'connection-changed', connected: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(socketMock.register).toHaveBeenCalledWith('Alice', false);

    dispatch({ type: 'registration-finished', success: true });
    expect(screen.getByRole('heading', { name: 'Your Choice' })).toBeVisible();

    const five = screen.getByRole('button', { name: '5' });
    await user.click(five);
    expect(five).toHaveAttribute('aria-pressed', 'true');
    expect(socketMock.send).toHaveBeenLastCalledWith({ action: 'record-choice', choice: '5' });

    await user.click(five);
    expect(five).toHaveAttribute('aria-pressed', 'false');
    expect(socketMock.send).toHaveBeenLastCalledWith({ action: 'record-choice', choice: undefined });

    dispatch({
      type: 'server-message',
      message: {
        choices: [
          { name: 'Alice', choice: '8', snoozed: false, observer: false },
          { name: 'Bob', choice: '8', snoozed: false, observer: false },
        ],
      },
    });

    expect(screen.getByRole('button', { name: 'Reset round' })).toBeVisible();
    expect(screen.getByRole('button', { name: '3' })).toBeDisabled();
    expect(celebrate).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Reset round' }));
    expect(socketMock.send).toHaveBeenLastCalledWith({ action: 'reset' });
  });

  it('hides voting controls for a registered observer and shows server errors', async () => {
    const user = userEvent.setup();
    render(<App />);
    dispatch({ type: 'connection-changed', connected: true });

    await user.type(screen.getByLabelText('Name'), 'Watcher');
    await user.click(screen.getByLabelText('Observer mode'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(socketMock.register).toHaveBeenCalledWith('Watcher', true);

    dispatch({ type: 'registration-finished', success: true });
    dispatch({
      type: 'server-message',
      message: {
        players: [{ name: 'Watcher', choice: undefined, snoozed: false, observer: true }],
      },
    });

    expect(screen.queryByRole('heading', { name: 'Your Choice' })).not.toBeInTheDocument();
    expect(screen.getByText('observer')).toBeVisible();

    dispatch({
      type: 'registration-finished',
      success: false,
      error: 'name is already taken',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('name is already taken');
  });
});
