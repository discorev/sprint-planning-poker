import { memo, type FormEvent } from 'react';

interface RegisterProps {
  readonly name: string;
  readonly observer: boolean;
  readonly submitted: boolean;
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
    <div className="mx-auto mt-[10px] w-full max-w-[1140px] px-3">
      <form onSubmit={submit}>
        {error ? (
          <div className="relative mb-4 rounded border border-[#f5c6cb] bg-[#f8d7da] px-5 py-3 text-[#721c24]" role="alert">
            <strong>Failed!</strong> {error}
            <button
              aria-label="Close"
              className="absolute right-3 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1 text-2xl leading-none text-[#721c24]/70 hover:text-[#721c24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={onDismissError}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null}
        <div className="mb-4">
          <label className="mb-2 inline-block" htmlFor="name">Name</label>
          <input
            autoComplete="off"
            className="block h-[38px] w-full rounded border border-[#ced4da] bg-white px-3 py-1.5 text-base text-[#495057] transition focus:border-[#80bdff] focus:outline-none focus:ring-[3px] focus:ring-[#007bff]/25"
            id="name"
            name="name"
            onChange={(event) => onNameChange(event.target.value)}
            type="text"
            value={name}
          />
          <div className="relative mt-1 block min-h-6 pl-5">
            <input
              checked={observer}
              className="absolute left-0 top-[0.3rem] h-3 w-3 accent-[#007bff]"
              id="observer"
              onChange={(event) => onObserverChange(event.target.checked)}
              type="checkbox"
            />
            <label className="mb-0" htmlFor="observer">Observer mode</label>
          </div>
        </div>
        <button
          className="rounded border border-[#007bff] bg-[#007bff] px-3 py-1.5 text-white transition hover:border-[#0062cc] hover:bg-[#0069d9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007bff] disabled:border-[#007bff] disabled:opacity-65"
          disabled={name.length < 3 || submitted}
          type="submit"
        >
          Submit
        </button>
      </form>
    </div>
  );
});
