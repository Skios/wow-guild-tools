import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMeta, useSpecInfo } from '../context';
import { moveItem, validateRosterEntry, type RosterFormField, type RosterFormValues } from '../rosterForm';
import type { CharacterSuggestion, RosterEntryInput } from '../types';
import { errorMessage } from '../useAsync';
import { XIcon } from './icons';

interface Props {
  initial: RosterFormValues;
  submitLabel: string;
  /** Resolves when saved; rejects with a readable message otherwise. */
  onSubmit: (entry: RosterEntryInput) => Promise<void>;
  onCancel?: () => void;
  /** Keep these fields after a successful save (adding many names to the same realm). */
  keepAfterSave?: RosterFormField[];
  /** Name suggestions while typing; picking one fills name, realm and class as the game spells them. */
  suggest?: (term: string) => Promise<CharacterSuggestion[]>;
  /** Name, realm and class can't change (editing the specs of an existing character). */
  lockIdentity?: boolean;
  hideNickname?: boolean;
}

const SUGGEST_DELAY_MS = 300;

export function RosterForm({ initial, submitLabel, onSubmit, onCancel, keepAfterSave = [], suggest, lockIdentity, hideNickname }: Props) {
  const meta = useMeta();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<RosterFormField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const specs = meta.classes.find(c => c.id === values.class)?.specs ?? [];
  const specInfo = useSpecInfo(values.class);
  const addable = specs.filter(s => s.id !== values.spec && !values.offSpecs.includes(s.id));

  const set = (field: Exclude<RosterFormField, 'offSpecs'>) => (e: { target: { value: string } }) =>
    setValues(v => ({
      ...v,
      [field]: e.target.value,
      ...(field === 'class' && { spec: '', offSpecs: [] }),
      ...(field === 'spec' && { offSpecs: v.offSpecs.filter(id => id !== e.target.value) }),
    }));
  const setOffSpecs = (change: (list: string[]) => string[]) => setValues(v => ({ ...v, offSpecs: change(v.offSpecs) }));

  const [suggestions, setSuggestions] = useState<CharacterSuggestion[]>([]);
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    const term = values.name.trim();
    if (!suggest || lockIdentity || picked || term.length < 2) return setSuggestions([]);
    let current = true;
    const timer = setTimeout(() => {
      suggest(term).then(found => { if (current) setSuggestions(found); }, () => { if (current) setSuggestions([]); });
    }, SUGGEST_DELAY_MS);
    return () => { current = false; clearTimeout(timer); };
  }, [values.name, suggest, lockIdentity, picked]);
  const pick = (s: CharacterSuggestion) => {
    setValues(v => ({ ...v, name: s.name, realm: s.realm, ...(s.class && s.class !== v.class && { class: s.class, spec: '', offSpecs: [] }) }));
    setPicked(true);
    setSuggestions([]);
  };

  // Announced to screen readers, and where focus goes once the list has re-rendered.
  const [announcement, setAnnouncement] = useState('');
  const focusNext = useRef<(() => void) | null>(null);
  const buttons = useRef<Record<string, HTMLElement | null>>({});
  const addSelect = useRef<HTMLSelectElement>(null);
  const track = (key: string) => (el: HTMLElement | null) => { buttons.current[key] = el; };
  useEffect(() => { focusNext.current?.(); focusNext.current = null; }, [values.offSpecs]);

  const addOffSpec = (id: string) => {
    setOffSpecs(l => [...l, id]);
    setAnnouncement(`Added ${specInfo(id).label}`);
  };
  const moveOffSpec = (i: number, direction: -1 | 1) => {
    const id = values.offSpecs[i]!;
    if (!values.offSpecs[i + direction]) return;
    const way = direction < 0 ? 'up' : 'down';
    setOffSpecs(l => moveItem(l, i, direction));
    setAnnouncement(`Moved ${specInfo(id).label} ${way}`);
    focusNext.current = () => buttons.current[`${way}-${id}`]?.focus();
  };
  const removeOffSpec = (i: number) => {
    const id = values.offSpecs[i]!;
    const neighbour = values.offSpecs[i + 1] ?? values.offSpecs[i - 1];
    setOffSpecs(l => l.filter(x => x !== id));
    setAnnouncement(`Removed ${specInfo(id).label}`);
    focusNext.current = () => (neighbour ? buttons.current[`remove-${neighbour}`] : addSelect.current)?.focus();
  };

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
          <input
            id="roster-name" value={values.name} autoComplete="off" disabled={lockIdentity} {...field('name')}
            onChange={e => { setPicked(false); set('name')(e); }}
          />
          {suggestions.length > 0 && (
            <ul className="suggestions" aria-label="Suggestions">
              {suggestions.map(s => (
                <li key={`${s.name}|${s.realm}`}>
                  <button type="button" onClick={() => pick(s)}>
                    {s.name} <span className="muted">· {s.realm}{s.inGuild ? ' · guild' : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fieldError('name')}
        </div>
        <div>
          <label htmlFor="roster-realm">Realm</label>
          <input id="roster-realm" value={values.realm} onChange={set('realm')} autoComplete="off" disabled={lockIdentity} {...field('realm')} />
          {fieldError('realm')}
        </div>
        <div>
          <label htmlFor="roster-class">Class</label>
          <select id="roster-class" value={values.class} onChange={set('class')} disabled={lockIdentity} {...field('class')}>
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
      <div className="grid">
        {!hideNickname && (
          <div>
            <label htmlFor="roster-nickname">Nickname (optional)</label>
            <input id="roster-nickname" value={values.nickname} onChange={set('nickname')} autoComplete="off" {...field('nickname')} />
            {fieldError('nickname')}
          </div>
        )}
        <fieldset className="offspec-picker" aria-describedby={errors.offSpecs ? 'roster-offSpecs-error' : undefined}>
          <legend>Off-specs, in order of preference</legend>
          <ol className="offspec-list" aria-label="Off-specs in order">
            {values.offSpecs.map((id, i) => {
              const { label, roleLabel } = specInfo(id);
              return (
                <li key={id}>
                  <span className="ordinal">#{i + 2}</span>
                  <span>{label}{roleLabel && ` (${roleLabel})`}</span>
                  <button type="button" className="icon-button" ref={track(`up-${id}`)} aria-label={`Move ${label} up`} aria-disabled={i === 0 || undefined} onClick={() => moveOffSpec(i, -1)}>↑</button>
                  <button type="button" className="icon-button" ref={track(`down-${id}`)} aria-label={`Move ${label} down`} aria-disabled={i === values.offSpecs.length - 1 || undefined} onClick={() => moveOffSpec(i, 1)}>↓</button>
                  <button type="button" className="icon-button" ref={track(`remove-${id}`)} aria-label={`Remove ${label} from off-specs`} title="Remove" onClick={() => removeOffSpec(i)}><XIcon /></button>
                </li>
              );
            })}
          </ol>
          <select
            ref={addSelect}
            aria-label="Add an off-spec"
            value=""
            disabled={addable.length === 0}
            onChange={e => e.target.value && addOffSpec(e.target.value)}
            {...field('offSpecs')}
          >
            <option value="">Add an off-spec…</option>
            {addable.map(s => <option key={s.id} value={s.id}>{specInfo(s.id).label} ({specInfo(s.id).roleLabel})</option>)}
          </select>
          {fieldError('offSpecs')}
          <p className="sr-only" aria-live="polite">{announcement}</p>
        </fieldset>
      </div>
      {serverError && <p role="alert" className="error">{serverError}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}
