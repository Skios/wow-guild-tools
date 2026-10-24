import { STATUSES } from '../roster';
import type { MessageResult, NoAnswerEntry, ResponseStatus } from '../types';
import { CharacterName } from './CharacterName';
import { OffSpecs } from './OffSpecs';
import { SpecIcon } from './SpecIcon';
import { ContactedLine } from './ContactedLine';

const STATUS_LABEL: Record<ResponseStatus, string> = { IN: 'In', LATE: 'Late', TENTATIVE: 'Tentative', BENCH: 'Bench', OUT: 'Out' };

const RESULT_TEXT: Record<MessageResult['status'], (r: MessageResult) => string> = {
  sent: () => 'sent',
  unreachable: () => 'has not started the bot yet',
  unclaimed: () => 'nobody has claimed this name yet',
  failed: r => `failed: ${r.error ?? 'unknown error'}`,
  unknown: () => 'not found',
};

interface Props {
  people: NoAnswerEntry[];
  /** How many people (no answer + tentative) are ticked for the message. */
  recipientCount: number;
  selected: Set<string>;
  disabled: boolean;
  defaultMessage: string;
  text: string;
  sending: boolean;
  results: MessageResult[] | null;
  onText: (text: string) => void;
  onToggle: (characterId: string, selected: boolean) => void;
  onSelectReachable: () => void;
  onClearSelection: () => void;
  onMark: (person: NoAnswerEntry, status: ResponseStatus) => void;
  onSend: () => void;
}

export function NoAnswerPanel(p: Props) {
  const reachable = p.people.filter(person => person.reachable).length;
  return (
    <aside className="card no-answer" aria-label={`No answer (${p.people.length})`}>
      <h3>No answer <span className="count">{p.people.length}</span></h3>

      {p.people.length === 0 ? (
        <p className="muted empty">Everybody in the roster has answered.</p>
      ) : (
        <>
          <div className="actions compact">
            <button type="button" onClick={p.onSelectReachable} disabled={p.disabled || reachable === 0}>
              Select all reachable ({reachable})
            </button>
            <button type="button" onClick={p.onClearSelection} disabled={p.selected.size === 0}>Clear</button>
          </div>
          <ul className="people">
            {p.people.map(person => (
              <li className="person" key={person.id}>
                <input
                  type="checkbox"
                  aria-label={`Select ${person.name} for a message`}
                  checked={p.selected.has(person.id)}
                  disabled={p.disabled || !person.reachable}
                  onChange={e => p.onToggle(person.id, e.target.checked)}
                />
                <SpecIcon classId={person.class} spec={person.spec} role={person.role} />
                <OffSpecs classId={person.class} offSpecs={person.offSpecs} />
                <span className="person-name">
                  <CharacterName name={person.name} classId={person.class} nickname={person.nickname} />
                  {!person.reachable && (
                    <span className="muted note"> {person.username ? 'not on the bot yet' : 'unclaimed name'}</span>
                  )}
                  {person.reachable && person.username && !person.nickname && <span className="muted person-user"> @{person.username}</span>}
                  <ContactedLine at={person.contactedAt} />
                </span>
                <select
                  aria-label={`Mark ${person.name} as`}
                  value=""
                  disabled={p.disabled}
                  onChange={e => e.target.value && p.onMark(person, e.target.value as ResponseStatus)}
                >
                  <option value="">Mark as…</option>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="composer">
        <label htmlFor="message-text">Message <span className="muted">(optional, max 500)</span></label>
        <textarea
          id="message-text"
          rows={3}
          maxLength={500}
          placeholder={p.defaultMessage}
          value={p.text}
          disabled={p.disabled}
          onChange={e => p.onText(e.target.value)}
        />
        <p className="muted hint">Leave it empty to send the default reminder. Players get buttons to answer from the chat.</p>
        <button type="button" className="primary" disabled={p.disabled || p.sending || p.recipientCount === 0} onClick={p.onSend}>
          {p.sending ? 'Sending…' : `Send to ${p.recipientCount} ${p.recipientCount === 1 ? 'person' : 'people'}`}
        </button>
      </div>

      {p.results && (
        <ul className="results" aria-label="Message results">
          {p.results.map(r => (
            <li key={r.characterId} className={r.status === 'sent' ? 'ok' : 'problem'}>
              <strong>{r.name ?? 'Unknown'}</strong>: {RESULT_TEXT[r.status](r)}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
