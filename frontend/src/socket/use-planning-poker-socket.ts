import { useCallback, useEffect, useMemo, useRef, type Dispatch } from 'react';
import type { ClientMessage } from '../protocol';
import type { AppAction } from '../state/app-state';
import { PlanningPokerSocket, planningPokerSocketUrl } from './planning-poker-socket';

export interface PlanningPokerSocketControls {
  readonly register: (name: string, observer: boolean) => void;
  readonly send: (message: ClientMessage) => void;
  readonly setSubject: (subject: string) => void;
}

export function usePlanningPokerSocket(dispatch: Dispatch<AppAction>): PlanningPokerSocketControls {
  const socketRef = useRef<PlanningPokerSocket | undefined>(undefined);

  useEffect(() => {
    const socket = new PlanningPokerSocket({
      url: planningPokerSocketUrl(),
      onConnectionChange: (connected) => {
        dispatch({ type: 'connection-changed', connected });
      },
      onMessage: (message) => {
        dispatch({ type: 'server-message', message });
      },
    });
    socketRef.current = socket;
    return () => {
      socketRef.current = undefined;
      socket.close();
    };
  }, [dispatch]);

  const register = useCallback((name: string, observer: boolean) => {
    dispatch({ type: 'registration-started' });
    socketRef.current?.register(name, observer, (success, error) => {
      dispatch({ type: 'registration-finished', success, error });
    });
  }, [dispatch]);

  const send = useCallback((message: ClientMessage) => {
    socketRef.current?.send(message);
  }, []);

  const setSubject = useCallback((subject: string) => {
    socketRef.current?.send({ action: 'set-subject', subject });
  }, []);

  return useMemo(() => ({ register, send, setSubject }), [register, send, setSubject]);
}
