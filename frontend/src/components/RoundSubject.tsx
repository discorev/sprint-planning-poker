import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface RoundSubjectProps {
  readonly subject?: string;
  readonly onCommit: (subject: string) => void;
}

export const RoundSubject = memo(function RoundSubject({ subject, onCommit }: RoundSubjectProps) {
  const [draft, setDraft] = useState(subject ?? '');
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(subject ?? '');
    }
  }, [subject]);

  const commit = () => {
    if (draft !== (subject ?? '')) {
      onCommit(draft);
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  };

  return (
    <div className="mb-2">
      <label className="sr-only" htmlFor="round-subject">What are we estimating?</label>
      <input
        className="block h-[38px] w-full rounded border border-black/15 bg-white px-3 py-1.5 text-base text-[#495057] transition focus:border-[#80bdff] focus:outline-none focus:ring-[3px] focus:ring-[#007bff]/25"
        id="round-subject"
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onKeyDown={keyDown}
        placeholder="What are we estimating?"
        type="text"
        value={draft}
      />
    </div>
  );
});
