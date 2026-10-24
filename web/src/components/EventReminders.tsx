import { useState } from 'react';
import { useApi } from '../context';
import type { Reminder } from '../types';
import { errorMessage } from '../useAsync';
import { RemindersEditor } from './RemindersEditor';

/** The event's reminders; each change is saved at once. */
export function EventReminders({ eventId, initial, closed }: { eventId: string; initial: Reminder[]; closed: boolean }) {
  const api = useApi();
  const [reminders, setReminders] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (minutesBefore: number[]) => {
    if (busy) return; // not disabled while saving: that would throw the keyboard focus out of the editor
    setBusy(true);
    setProblem(null);
    try {
      setReminders(await api.setReminders(eventId, minutesBefore));
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-label="Reminders">
      <h3>Reminders</h3>
      <p className="muted">
        {closed ? 'Sign-ups are closed: no more reminders go out.' : 'At each time, everyone who hasn’t answered gets a private message with the answer buttons.'}
      </p>
      <RemindersEditor
        value={reminders.map(r => r.minutesBefore)}
        sent={reminders.filter(r => r.sentAt).map(r => r.minutesBefore)}
        onChange={save}
        disabled={closed}
        error={problem}
      />
    </section>
  );
}
