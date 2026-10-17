import { STATUSES, type RosterRow } from '../roster';
import { useRoleLabel } from '../context';
import type { ResponseStatus } from '../types';
import { CharacterName } from './CharacterName';
import { RoleIcon } from './RoleIcon';

const STATUS_LABEL: Record<ResponseStatus, string> = { IN: 'In', TENTATIVE: 'Tentative', BENCH: 'Bench', OUT: 'Out' };

function RoleCell({ role }: { role: RosterRow['role'] }) {
  const label = useRoleLabel(role);
  return <span className="role-cell"><RoleIcon role={role} /><span className="role-label">{label}</span></span>;
}

interface Props {
  rows: RosterRow[];
  disabled: boolean;
  onStatus: (characterId: string, status: ResponseStatus) => void;
  onConfirm: (characterId: string, confirmed: boolean) => void;
}

export function RosterTable({ rows, disabled, onStatus, onConfirm }: Props) {
  if (rows.length === 0) {
    return <p className="muted">Nobody has answered yet. Add characters below to build the roster by hand.</p>;
  }
  return (
    <table className="table roster">
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col">Character</th>
          <th scope="col">Player</th>
          <th scope="col">Answer</th>
          <th scope="col">Confirmed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.characterId} className={row.isConfirmed ? 'confirmed' : undefined}>
            <td><RoleCell role={row.role} /></td>
            <td><CharacterName name={row.name} classId={row.class} realm={row.realm} /></td>
            <td className="muted">{row.username}</td>
            <td>
              <select
                aria-label={`Answer for ${row.name}`}
                value={row.status}
                disabled={disabled}
                onChange={e => onStatus(row.characterId, e.target.value as ResponseStatus)}
              >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </td>
            <td>
              <input
                type="checkbox"
                aria-label={`Confirm ${row.name}`}
                checked={row.isConfirmed}
                disabled={disabled}
                onChange={e => onConfirm(row.characterId, e.target.checked)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
