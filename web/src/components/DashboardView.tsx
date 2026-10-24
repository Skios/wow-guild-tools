import { useState } from 'react';
import { useApi } from '../context';
import type { QuickAnswer, Span } from '../types';
import { errorMessage, useAsync } from '../useAsync';
import { MyEvents } from './MyEvents';
import { Attendance, Glance, Todo } from './OfficerSections';

/** The home page: your next events for everyone; composition, to do and attendance for officers. */
export function DashboardView() {
  const api = useApi();
  const [span, setSpan] = useState<Span>(10);
  // The span isn't a dependency: changing it reloads in place instead of blanking the whole page.
  const board = useAsync(() => api.dashboard(span), [api]);
  const changeSpan = (next: Span) => { setSpan(next); board.reload(); };
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /** Resolves to the error message, or null when saved. A second click while saving is ignored. */
  const answer = async (eventId: string, a: QuickAnswer): Promise<string | null> => {
    if (busy) return null;
    setBusy(true);
    setProblem(null);
    try {
      await api.answerEvent(eventId, a);
      board.reload();
      return null;
    } catch (e) {
      setProblem(errorMessage(e));
      return errorMessage(e);
    } finally {
      setBusy(false);
    }
  };

  const data = board.data;
  return (
    <div className="stack dashboard">
      <h1 className="sr-only">Home</h1>
      {(problem || board.error) && <p role="alert" className="error">{problem ?? board.error}</p>}
      {!data && board.loading && <p className="muted" role="status">Loading…</p>}
      {data && (
        <>
          <MyEvents characters={data.me.characters} events={data.me.events} busy={busy} onAnswer={answer} />
          {data.todo && <Todo todo={data.todo} />}
          {data.composition && <Glance rows={data.composition} />}
          {data.attendance && <Attendance data={data.attendance} span={data.attendance.span} onSpan={changeSpan} loading={board.loading} />}
        </>
      )}
    </div>
  );
}
