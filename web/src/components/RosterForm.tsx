import { useState, type FormEvent } from 'react';
import { useMeta } from '../context';
import { validateRosterEntry, type RosterFormField, type RosterFormValues } from '../rosterForm';
import type { RosterEntryInput } from '../types';
import { errorMessage } from '../useAsync';

interface Props {
  initial: RosterFormValues;
  submitLabel: string;
  /** Resolves when saved; rejects with a readable message otherwise. */
  onSubmit: (entry: RosterEntryInput) => Promise<void>;
  onCancel?: () => void;
  /** Keep these fields after a successful save (adding many names to the same realm). */
  keepAfterSave?: RosterFormField[];
}

export function RosterForm({ initial, submitLabel, onSubmit, onCancel, keepAfterSave = [] }: Props) {
  const meta = useMeta();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<RosterFormField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const specs = meta.classes.find(c => c.id === values.class)?.specs ?? [];

  const set = (field: RosterFormField) => (e: { target: { value: string } }) =>
    setValues(v => ({ ...v, [field]: e.target.value, ...(field === 'class' && { spec: '' }) }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = validateRosterEntry(values, meta);
    setErrors(result.errors);
    setServerError(null);
    if (!result.payload) return;

    setBusy(true);
    try {
      await onSubmit(result.payload);
      setValues(v => (Object.fromEntries(
        (Object.keys(initial) as RosterFormField[]).map(k => [k, keepAfterSave.includes(k) ? v[k] : initial[k]]),
      ) as unknown as RosterFormValues));
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (name: RosterFormField) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `roster-${name}-error` : undefined,
  });
  const fieldError = (name: RosterFormField) =>
    errors[name] ? <p id={`roster-${name}-error`} className="error field-error">{errors[name]}</p> : null;

  return (
    <form className="roster-form" onSubmit={submit} noValidate aria-label={submitLabel}>
      <div className="grid four">
        <div>
          <label htmlFor="roster-name">Character</label>
          <input id="roster-name" value={values.name} onChange={set('name')} autoComplete="off" {...field('name')} />
          {fieldError('name')}
        </div>
        <div>
          <label htmlFor="roster-realm">Realm</label>
          <input id="roster-realm" value={values.realm} onChange={set('realm')} autoComplete="off" {...field('realm')} />
          {fieldError('realm')}
        </div>
        <div>
          <label htmlFor="roster-class">Class</label>
          <select id="roster-class" value={values.class} onChange={set('class')} {...field('class')}>
            <option value="">Choose…</option>
            {meta.classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {fieldError('class')}
        </div>
        <div>
          <label htmlFor="roster-spec">Specialization</label>
          <select id="roster-spec" value={values.spec} onChange={set('spec')} disabled={specs.length === 0} {...field('spec')}>
            <option value="">{specs.length ? 'Choose…' : 'Pick a class first'}</option>
            {specs.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {fieldError('spec')}
        </div>
      </div>
      {serverError && <p role="alert" className="error">{serverError}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}
