import { useMeta, useRoleLabel } from '../context';
import { ROLES, type RosterGroups, type RosterRow } from '../roster';
import type { ResponseStatus, RoleId } from '../types';
import { PersonRow } from './PersonRow';
import { RoleIcon } from './RoleIcon';

export interface BoardHandlers {
  disabled: boolean;
  eventStart: string;
  onStatus: (characterId: string, status: ResponseStatus) => void;
  onConfirm: (characterId: string, confirmed: boolean) => void;
  onLateMinutes: (characterId: string, minutes: number | null) => void;
  /** The spec played that night (null = main). */
  onPlaySpec: (characterId: string, spec: string | null) => void;
  /** Switch the answer to another of the player's characters; undefined while it can't (unsaved changes). */
  onSwitch?: (characterId: string, to: string) => void;
  /** People who can be messaged from this list (tentative). */
  selected: Set<string>;
  onSelect: (characterId: string, selected: boolean) => void;
}

function People({ rows, handlers, selectable = false }: { rows: RosterRow[]; handlers: BoardHandlers; selectable?: boolean }) {
  return (
    <ul className="people">
      {rows.map(row => (
        <PersonRow
          key={row.characterId}
          row={row}
          eventStart={handlers.eventStart}
          disabled={handlers.disabled}
          onStatus={s => handlers.onStatus(row.characterId, s)}
          onConfirm={c => handlers.onConfirm(row.characterId, c)}
          onLateMinutes={m => handlers.onLateMinutes(row.characterId, m)}
          onPlaySpec={spec => handlers.onPlaySpec(row.characterId, spec)}
          onSwitch={handlers.onSwitch && (to => handlers.onSwitch!(row.characterId, to))}
          {...(selectable && {
            selection: { selected: handlers.selected.has(row.characterId), onToggle: (on: boolean) => handlers.onSelect(row.characterId, on) },
          })}
        />
      ))}
    </ul>
  );
}

function RoleColumn({ role, rows, handlers }: { role: RoleId; rows: RosterRow[]; handlers: BoardHandlers }) {
  const label = useRoleLabel(role);
  return (
    <section className="role-column" aria-label={`${label} (${rows.length})`}>
      <h4><RoleIcon role={role} /> {label} <span className="count">{rows.length}</span></h4>
      {rows.length === 0 ? <p className="muted empty">Nobody yet</p> : <People rows={rows} handlers={handlers} />}
    </section>
  );
}

function Section({ title, rows, handlers, hint, selectable }: {
  title: string; rows: RosterRow[]; handlers: BoardHandlers; hint?: string; selectable?: boolean;
}) {
  return (
    <section className="board-section" aria-label={`${title} (${rows.length})`}>
      <h3>{title} <span className="count">{rows.length}</span></h3>
      {hint && rows.length > 0 && <p className="muted hint">{hint}</p>}
      {rows.length === 0 ? <p className="muted empty">Nobody</p> : <People rows={rows} handlers={handlers} selectable={selectable ?? false} />}
    </section>
  );
}

/** Accepted players split by role on top, then late, bench, tentative and out. */
export function EventBoard({ groups, handlers }: { groups: RosterGroups; handlers: BoardHandlers }) {
  const meta = useMeta();
  const accepted = ROLES.reduce((total, role) => total + groups.accepted[role].length, 0);
  const roleOrder = meta.roles.map(r => r.id).filter(r => ROLES.includes(r));

  return (
    <div className="stack">
      <section className="card accepted" aria-label={`Accepted (${accepted})`}>
        <h3>Accepted <span className="count">{accepted}</span></h3>
        <div className="role-columns">
          {(roleOrder.length ? roleOrder : ROLES).map(role => (
            <RoleColumn key={role} role={role} rows={groups.accepted[role]} handlers={handlers} />
          ))}
        </div>
      </section>

      <div className="card">
        <Section title="Late" rows={groups.late} handlers={handlers} hint="Coming, but later. The time is when they arrive." />
        <Section title="Bench" rows={groups.bench} handlers={handlers} />
        <Section title="Tentative" rows={groups.tentative} handlers={handlers} selectable hint="Tick people to message them from the panel on the right." />
        <Section title="Out" rows={groups.out} handlers={handlers} />
      </div>
    </div>
  );
}
