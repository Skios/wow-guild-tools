import { useState, type FormEvent } from 'react';
import { useApi } from '../context';
import { MAX_DESCRIPTION, MAX_TITLE, validateNewEvent, type EventFormField, type EventFormValues } from '../eventForm';
import { toLocalInput } from '../format';
import { errorMessage } from '../useAsync';

export interface Creator {
  userId: string;
  username: string;
}

const CREATOR_KEY = 'guild-admin-creator';
const readCreator = () => { try { return localStorage.getItem(CREATOR_KEY) ?? ''; } catch { return ''; } };
const rememberCreator = (id: string) => { try { localStorage.setItem(CREATOR_KEY, id); } catch { /* optional */ } };

function initialValues(creators: Creator[]): EventFormValues {
  const now = new Date();
  const remembered = readCreator();
  const createdByUserId = creators.some(c => c.userId === remembered) ? remembered : (creators[0]?.userId ?? '');
  return { title: '', start: toLocalInput(now, 24), end: toLocalInput(now, 27), description: '', createdByUserId };
}

export function NewEventForm({ creators, onCreated }: { creators: Creator[]; onCreated: () => void }) {
  const api = useApi();
  const [values, setValues] = useState(() => initialValues(creators));
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
      await api.createEvent(result.payload);
      rememberCreator(values.createdByUserId);
      setValues(v => ({ ...initialValues(creators), createdByUserId: v.createdByUserId }));
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

  if (creators.length === 0) {
    return (
      <section className="card" aria-label="New event">
        <h2>New event</h2>
        <p className="muted">Nobody has registered yet. Players register their character through the Telegram bot, then you can create events.</p>
      </section>
    );
  }

  return (
    <form className="card new-event" onSubmit={submit} noValidate aria-label="New event">
      <h2>New event</h2>
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
        <div>
          <label htmlFor="creator">Created by</label>
          <select id="creator" value={values.createdByUserId} onChange={set('createdByUserId')} {...field('createdByUserId')}>
            {creators.map(c => <option key={c.userId} value={c.userId}>{c.username}</option>)}
          </select>
          {fieldError('createdByUserId')}
        </div>
      </div>
      {serverError && <p role="alert" className="error">{serverError}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>
    </form>
  );
}
