import { formatTime, arrivalTime } from '../format';
import { MAX_LATE_MINUTES, STATUSES, type RosterRow } from '../roster';
import type { ResponseStatus } from '../types';
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
  /** Present when the person can be picked for a message (tentative players). */
  selection?: { selected: boolean; onToggle: (selected: boolean) => void };
}

export function PersonRow({ row, eventStart, disabled, onStatus, onConfirm, onLateMinutes, selection }: Props) {
  const late = row.status === 'LATE';
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
        {row.username && <span className="muted person-user"> @{row.username}</span>}
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
