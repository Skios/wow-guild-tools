import { formatTime, arrivalTime } from '../format';
import { MAX_LATE_MINUTES, STATUSES, type RosterRow } from '../roster';
import type { ResponseStatus } from '../types';
import { useSpecInfo } from '../context';
import { CharacterName } from './CharacterName';
import { OffSpecs } from './OffSpecs';
import { SpecIcon } from './SpecIcon';

const STATUS_LABEL: Record<ResponseStatus, string> = { IN: 'In', LATE: 'Late', TENTATIVE: 'Tentative', BENCH: 'Bench', OUT: 'Out' };

interface Props {
  row: RosterRow;
  eventStart: string;
  disabled: boolean;
  onStatus: (status: ResponseStatus) => void;
  onConfirm: (confirmed: boolean) => void;
  onLateMinutes: (minutes: number | null) => void;
  onPlaySpec: (spec: string | null) => void;
  /** Missing while switching isn't possible (unsaved changes): the control is hidden. */
  onSwitch?: ((to: string) => void) | undefined;
  /** Present when the person can be picked for a message (tentative players). */
  selection?: { selected: boolean; onToggle: (selected: boolean) => void };
}

export function PersonRow({ row, eventStart, disabled, onStatus, onConfirm, onLateMinutes, onPlaySpec, onSwitch, selection }: Props) {
  const late = row.status === 'LATE';
  const specInfo = useSpecInfo(row.class);
  const mainSpec = row.main?.spec ?? (row.playSpec ? null : row.spec);
  const alternatives = row.alternatives ?? [];
  return (
    <li className={`person${row.isConfirmed ? ' confirmed' : ''}`}>
      {selection && (
        <input
          type="checkbox"
          aria-label={`Select ${row.name} for a message`}
          checked={selection.selected}
          onChange={e => selection.onToggle(e.target.checked)}
        />
      )}
      <SpecIcon classId={row.class} spec={row.spec} role={row.role} />
      <OffSpecs classId={row.class} offSpecs={row.offSpecs} />
      <span className="person-name">
        <CharacterName name={row.name} classId={row.class} nickname={row.nickname} />
        {late && row.lateMinutes !== null && <span className="muted"> ({formatTime(arrivalTime(eventStart, row.lateMinutes))})</span>}
        {row.username && !row.nickname && <span className="muted person-user"> @{row.username}</span>}
        {row.note && <span className="person-note">{row.note}</span>}
      </span>

      <span className="person-controls">
        {late && (
          <input
            className="minutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_LATE_MINUTES}
            step={1}
            placeholder="min"
            aria-label={`Minutes late for ${row.name}`}
            value={row.lateMinutes ?? ''}
            disabled={disabled}
            onChange={e => onLateMinutes(e.target.value === '' ? null : Number(e.target.value))}
          />
        )}
        {row.offSpecs.length > 0 && (
          <select
            aria-label={`${row.name} plays as`}
            value={row.playSpec ?? mainSpec ?? ''}
            disabled={disabled}
            onChange={e => onPlaySpec(e.target.value === mainSpec || e.target.value === '' ? null : e.target.value)}
          >
            {mainSpec ? <option value={mainSpec}>{specInfo(mainSpec).label} (main)</option> : <option value="">Main spec</option>}
            {/* An off-spec saved before the player removed it still shows as what it is. */}
            {[...row.offSpecs, ...(row.playSpec && !row.offSpecs.includes(row.playSpec) ? [row.playSpec] : [])].map(id => {
              const { label, role, roleLabel } = specInfo(id);
              return <option key={id} value={id} disabled={!role}>{label}{roleLabel && ` (${roleLabel})`}</option>;
            })}
          </select>
        )}
        {/* Only while it can be used; with unsaved changes the board says why it's gone. */}
        {alternatives.length > 0 && onSwitch && (
          <select
            aria-label={`Switch ${row.name} to`}
            value=""
            disabled={disabled}
            onChange={e => { if (e.target.value) onSwitch?.(e.target.value); }}
          >
            <option value="">Switch to…</option>
            {alternatives.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select
          aria-label={`Answer for ${row.name}`}
          value={row.status}
          disabled={disabled}
          onChange={e => onStatus(e.target.value as ResponseStatus)}
        >
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="raid-toggle" title="Part of the final raid">
          <input
            type="checkbox"
            aria-label={`Confirm ${row.name}`}
            checked={row.isConfirmed}
            disabled={disabled}
            onChange={e => onConfirm(e.target.checked)}
          />
          <span aria-hidden="true">Raid</span>
        </label>
      </span>
    </li>
  );
}
