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
    <section className="subject-row">
      <label className="sr-only" htmlFor="round-subject">What are we estimating?</label>
      <input
        className="subject-input"
        id="round-subject"
        maxLength={500}
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
    </section>
  );
});
