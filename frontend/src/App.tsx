import { useCallback, useEffect, useReducer } from 'react';
import { CardDeck } from './components/CardDeck';
import { ConnectionModal } from './components/ConnectionModal';
import { PlayerCard } from './components/PlayerCard';
import { Register } from './components/Register';
import { celebrate } from './celebrate';
import { usePlanningPokerSocket } from './socket/use-planning-poker-socket';
import { appReducer, initialAppState } from './state/app-state';

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const socket = usePlanningPokerSocket(dispatch);

  useEffect(() => {
    if (state.celebrationCount > 0) {
      celebrate();
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

  const self = state.players.find((player) => player.name === state.name);
  const isObserver = self?.observer === true;

  return (
    <>
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
        />
      ) : (
        <main className="mx-auto mt-[10px] w-full max-w-[1140px] px-3">
          {!isObserver ? (
            <section className="mb-2 rounded border border-black/15 bg-white">
              <h2 className="mb-0 border-b border-black/15 bg-black/[0.03] px-5 py-3 text-base font-normal">Your Choice</h2>
              <div className="p-5">
                <CardDeck cards={state.cards} disabled={state.showReset} onChoose={choose} selection={state.selection} />
              </div>
            </section>
          ) : null}

          <section aria-label="Players" className="grid grid-cols-1 gap-x-[30px] md:grid-cols-5">
            {state.players.map((player) => (
              <div className="mb-6 min-w-0" key={player.name}>
                <PlayerCard onSnooze={snooze} player={player} />
              </div>
            ))}
            {state.showReset ? (
              <div className="mb-6 min-w-0">
                <button
                  aria-label="Reset round"
                  className="w-full rounded border border-black/15 bg-white text-[#212529] transition hover:border-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007bff]"
                  onClick={reset}
                  type="button"
                >
                  <span className="flex items-center justify-center p-5">
                    <span className="fa-stack fa-2x" aria-hidden="true">
                      <i className="far fa-recycle fa-stack-1x" />
                      <i className="fal fa-trash fa-stack-2x" />
                    </span>
                  </span>
                </button>
              </div>
            ) : null}
          </section>
        </main>
      )}
      <ConnectionModal connected={state.connected} />
    </>
  );
}
