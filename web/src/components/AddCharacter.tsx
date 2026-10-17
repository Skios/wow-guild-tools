import { useMemo, useState } from 'react';
import { useRoleLabel } from '../context';
import type { RosterRow } from '../roster';
import type { CharacterSummary } from '../types';
import { CharacterName } from './CharacterName';

const MAX_SUGGESTIONS = 8;

function Option({ character, onAdd }: { character: CharacterSummary; onAdd: (c: CharacterSummary) => void }) {
  const role = useRoleLabel(character.role);
  return (
    <li>
      <button type="button" onClick={() => onAdd(character)}>
        <CharacterName name={character.name} classId={character.class} realm={character.realm} />
        <span className="muted"> · {role}{character.username ? ` · ${character.username}` : ' · unclaimed'}{character.isMain ? '' : ' (alt)'}</span>
      </button>
    </li>
  );
}

interface Props {
  rows: RosterRow[];
  candidates: CharacterSummary[] | null;
  error: string | null;
  onAdd: (character: CharacterSummary) => void;
}

/** Lets officers put someone on the roster who never answered. */
export function AddCharacter({ rows, candidates, error, onAdd }: Props) {
  const [text, setText] = useState('');

  const available = useMemo(() => {
    const onList = new Set(rows.map(r => r.characterId));
    const needle = text.trim().toLocaleLowerCase();
    return (candidates ?? [])
      .filter(c => !onList.has(c.id))
      .filter(c => !needle || c.name.toLocaleLowerCase().includes(needle) || (c.username ?? '').toLocaleLowerCase().includes(needle));
  }, [rows, candidates, text]);

  return (
    <section className="card" aria-label="Add a character">
      <h3>Add a character</h3>
      <label htmlFor="add-character">Search by character or player name</label>
      <input id="add-character" value={text} onChange={e => setText(e.target.value)} autoComplete="off" />

      {error && <p role="alert" className="error">Could not load characters: {error}</p>}
      {!error && candidates === null && <p className="muted" role="status">Loading characters…</p>}
      {candidates !== null && available.length === 0 && (
        <p className="muted">{text.trim() ? 'No matching characters.' : 'Every registered character is already on the list.'}</p>
      )}
      {available.length > 0 && (
        <ul className="suggestions">
          {available.slice(0, MAX_SUGGESTIONS).map(c => <Option key={c.id} character={c} onAdd={onAdd} />)}
        </ul>
      )}
      {available.length > MAX_SUGGESTIONS && (
        <p className="muted">{available.length - MAX_SUGGESTIONS} more. Keep typing to narrow the list.</p>
      )}
    </section>
  );
}
