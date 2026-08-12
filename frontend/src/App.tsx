import { useCallback, useEffect, useReducer } from 'react';
import { CardDeck } from './components/CardDeck';
import { ConnectionModal } from './components/ConnectionModal';
import { Masthead } from './components/Masthead';
import { PlayerCard } from './components/PlayerCard';
import { Register } from './components/Register';
import { RevealStrip, TableStatus } from './components/RoundSummary';
import { RoundSubject } from './components/RoundSubject';
import { ThemeToggle } from './components/ThemeToggle';
import { celebrate } from './celebrate';
import { usePlanningPokerSocket } from './socket/use-planning-poker-socket';
import { appReducer, initialAppState } from './state/app-state';
import { THEMES, useTheme } from './theme';

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [theme, toggleTheme] = useTheme();
  const socket = usePlanningPokerSocket(dispatch);

  useEffect(() => {
    if (state.celebrationCount > 0) {
      celebrate(THEMES[theme].confetti);
    }
  }, [state.celebrationCount]);

  const nameChanged = useCallback((name: string) => {
    dispatch({ type: 'name-changed', name });
  }, []);

  const observerChanged = useCallback((observer: boolean) => {
    dispatch({ type: 'observer-changed', observer });
  }, []);

  const dismissError = useCallback(() => {
    dispatch({ type: 'registration-finished', success: false });
  }, []);

  const register = useCallback(() => {
    socket.register(state.name, state.observer);
  }, [socket, state.name, state.observer]);

  const choose = useCallback((option: string) => {
    if (state.showReset) {
      return;
    }
    const selection = state.selection === option ? undefined : option;
    dispatch({ type: 'selection-changed', selection });
    socket.send({ action: 'record-choice', choice: selection });
  }, [socket, state.selection, state.showReset]);

  const snooze = useCallback((name: string) => {
    socket.send({ action: 'snooze', player: name });
  }, [socket]);

  const reset = useCallback(() => {
    socket.send({ action: 'reset' });
  }, [socket]);

  const setSubject = useCallback((subject: string) => {
    socket.setSubject(subject);
  }, [socket]);

  const self = state.players.find((player) => player.name === state.name);
  const isObserver = self?.observer === true;

  return (
    <>
      <ThemeToggle onToggle={toggleTheme} theme={theme} />
      {!state.registered ? (
        <Register
          error={state.error}
          name={state.name}
          observer={state.observer}
          onDismissError={dismissError}
          onNameChange={nameChanged}
          onObserverChange={observerChanged}
          onRegister={register}
          submitted={state.submitting}
          theme={theme}
        />
      ) : (
        <main>
          <Masthead theme={theme} />
          <RoundSubject onCommit={setSubject} subject={state.subject} />
          {!isObserver ? (
            <section aria-label="Your choice" className="your-choice">
              <h2 className="section-title">Your Choice</h2>
              <CardDeck cards={state.cards} disabled={state.showReset} onChoose={choose} selection={state.selection} />
            </section>
          ) : null}
          <TableStatus name={state.name} players={state.players} showReset={state.showReset} />
          {state.showReset ? <RevealStrip players={state.players} theme={theme} /> : null}
          <section aria-label="Players">
            <div className="players-grid">
              {state.players.map((player, index) => (
                <PlayerCard
                  index={index}
                  isYou={player.name === state.name}
                  key={player.name}
                  onSnooze={snooze}
                  player={player}
                  showReset={state.showReset}
                  theme={theme}
                />
              ))}
              {state.showReset ? (
                <button aria-label="Reset round" className="player reset-tile" onClick={reset} type="button">
                  <span className="reset-icon"><i aria-hidden="true" className="fa-light fa-rotate-left" /></span>
                  New round
                </button>
              ) : null}
            </div>
          </section>
        </main>
      )}
      <ConnectionModal connected={state.connected} />
    </>
  );
}
