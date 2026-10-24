import { useState, type FormEvent } from 'react';
import { useApi } from '../context';
import { MAX_DESCRIPTION, MAX_TITLE, validateNewEvent, type EventFormField, type EventFormValues } from '../eventForm';
import { toLocalInput } from '../format';
import { DEFAULT_REMINDERS } from '../reminders';
import { errorMessage } from '../useAsync';
import { RemindersEditor } from './RemindersEditor';

function initialValues(): EventFormValues {
  const now = new Date();
  return { title: '', start: toLocalInput(now, 24), end: toLocalInput(now, 27), description: '' };
}

export function NewEventForm({ onCreated }: { onCreated: () => void }) {
  const api = useApi();
  const [values, setValues] = useState(initialValues);
  const [reminders, setReminders] = useState(DEFAULT_REMINDERS);
  const [errors, setErrors] = useState<Partial<Record<EventFormField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: EventFormField) => (e: { target: { value: string } }) =>
    setValues(v => ({ ...v, [field]: e.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = validateNewEvent(values);
    setErrors(result.errors);
    setServerError(null);
    if (!result.payload) return;

    setBusy(true);
    try {
      await api.createEvent({ ...result.payload, reminders });
      setValues(initialValues());
      setReminders(DEFAULT_REMINDERS);
      onCreated();
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (name: EventFormField) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const fieldError = (name: EventFormField) =>
    errors[name] ? <p id={`${name}-error`} className="error field-error">{errors[name]}</p> : null;

  return (
    <form className="card new-event" onSubmit={submit} noValidate aria-label="New event">
      <h2>New event</h2>
      <p className="muted">Everyone in the raid roster is invited automatically.</p>
      <div className="grid">
        <div className="span-2">
          <label htmlFor="title">Title</label>
          <input id="title" value={values.title} maxLength={MAX_TITLE + 20} onChange={set('title')} {...field('title')} />
          {fieldError('title')}
        </div>
        <div>
          <label htmlFor="start">Start</label>
          <input id="start" type="datetime-local" value={values.start} onChange={set('start')} {...field('start')} />
          {fieldError('start')}
        </div>
        <div>
          <label htmlFor="end">End</label>
          <input id="end" type="datetime-local" value={values.end} onChange={set('end')} {...field('end')} />
          {fieldError('end')}
        </div>
        <div className="span-2">
          <label htmlFor="description">Description <span className="muted">(optional, max {MAX_DESCRIPTION})</span></label>
          <textarea id="description" rows={2} value={values.description} onChange={set('description')} {...field('description')} />
          {fieldError('description')}
        </div>
        <fieldset className="span-2">
          <legend>Reminders <span className="muted">(a private message to whoever hasn&apos;t answered)</span></legend>
          <RemindersEditor value={reminders} onChange={setReminders} disabled={busy} />
        </fieldset>
      </div>
      {serverError && <p role="alert" className="error">{serverError}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>
    </form>
  );
}
