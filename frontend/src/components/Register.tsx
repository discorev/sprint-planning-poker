import { memo, type FormEvent } from 'react';
import { THEMES, type Theme } from '../theme';
import { Masthead } from './Masthead';

interface RegisterProps {
  readonly name: string;
  readonly observer: boolean;
  readonly submitted: boolean;
  readonly theme: Theme;
  readonly error?: string;
  readonly onNameChange: (name: string) => void;
  readonly onObserverChange: (observer: boolean) => void;
  readonly onDismissError: () => void;
  readonly onRegister: () => void;
}

export const Register = memo(function Register({
  name,
  observer,
  submitted,
  theme,
  error,
  onNameChange,
  onObserverChange,
  onDismissError,
  onRegister,
}: RegisterProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRegister();
  };

  return (
    <main>
      <Masthead full theme={theme} />
      <section aria-label="Register" className="register-panel">
        {error ? (
          <div className="error" role="alert">
            <strong>Failed!</strong> {error}
            <button aria-label="Close" className="close" onClick={onDismissError} type="button">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null}
        <form noValidate onSubmit={submit}>
          <label className="field-label" htmlFor="name">Name</label>
          <input
            autoComplete="off"
            className="text-input"
            id="name"
            maxLength={24}
            name="name"
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={THEMES[theme].placeholder}
            type="text"
            value={name}
          />
          <label className="check" htmlFor="observer">
            <input
              aria-label="Observer mode"
              checked={observer}
              id="observer"
              onChange={(event) => onObserverChange(event.target.checked)}
              type="checkbox"
            />
            Observer mode <span aria-hidden="true" className="hint">— watch, don't vote</span>
          </label>
          <button className="btn primary" disabled={name.length < 3 || submitted} type="submit">
            {THEMES[theme].join}
          </button>
        </form>
      </section>
    </main>
  );
});
