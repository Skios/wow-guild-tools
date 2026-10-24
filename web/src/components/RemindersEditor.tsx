import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { beforeLabel, reminderError } from '../reminders';
import { XIcon } from './icons';

const UNITS = { minutes: 1, hours: 60, days: 1440 } as const;
type Unit = keyof typeof UNITS;

type Props = {
  value: number[];
  onChange: (next: number[]) => void;
  /** Reminders already sent: shown as a record, not removable. */
  sent?: number[];
  disabled?: boolean;
  /** A problem from outside (e.g. saving failed), shown with the editor's own. */
  error?: string | null;
};

/** When whoever hasn't answered gets a private message: a list of "X before the start". */
export function RemindersEditor({ value, onChange, sent = [], disabled = false, error = null }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('days');
  const [ownError, setOwnError] = useState<string | null>(null);
  const shown = ownError ?? error;

  const change = (next: number[]) => {
    setOwnError(null);
    onChange(next);
    input.current?.focus(); // a removed chip takes its button with it: keep the keyboard in the editor
  };
  const add = () => {
    const problem = !/^\d+$/.test(amount.trim()) ? 'Enter a whole number' : reminderError(value, Number(amount) * UNITS[unit]);
    setOwnError(problem);
    if (problem) return;
    change([...value, Number(amount) * UNITS[unit]]);
    setAmount('');
  };
  const onEnter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // inside the New event form, Enter would submit it
    add();
  };

  return (
    <div className="stack">
      {value.length > 0 ? (
        <ul className="chips" aria-label="Reminders set">
          {[...value].sort((a, b) => b - a).map(minutes => (
            <li key={minutes}>
              {beforeLabel(minutes)}
              {sent.includes(minutes)
                ? <span className="muted"> · sent</span>
                : (
                  <button type="button" className="icon-button" disabled={disabled} aria-label={`Remove ${beforeLabel(minutes)}`}
                    onClick={() => change(value.filter(m => m !== minutes))}><XIcon /></button>
                )}
            </li>
          ))}
        </ul>
      ) : <p className="muted">No reminders.</p>}
      <div className="actions" role="group" aria-labelledby={`${id}-add`}>
        <span id={`${id}-add`} className="sr-only">Add a reminder</span>
        <label htmlFor={`${id}-amount`}>Remind</label>
        <input id={`${id}-amount`} ref={input} type="text" inputMode="numeric" value={amount} disabled={disabled}
          onChange={e => { setAmount(e.target.value); setOwnError(null); }} onKeyDown={onEnter} style={{ width: '5rem' }}
          aria-invalid={ownError ? true : undefined} aria-describedby={shown ? `${id}-error` : undefined} />
        <select aria-label="Unit" value={unit} disabled={disabled} onChange={e => { setUnit(e.target.value as Unit); setOwnError(null); }}>
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
        <span aria-hidden="true">before the start</span>
        <button type="button" disabled={disabled} onClick={add}>Add reminder</button>
      </div>
      {shown && <p id={`${id}-error`} role="alert" className="error field-error">{shown}</p>}
    </div>
  );
}
