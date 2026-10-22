import { useClassInfo } from '../context';

export function CharacterName({ name, classId, realm, nickname }: { name: string; classId: string; realm?: string; nickname?: string | null }) {
  const { color, label } = useClassInfo(classId);
  return (
    <span className="character">
      <strong className="character-name" style={{ color }} title={label}>{name}</strong>
      {nickname && <span className="muted nickname"> · {nickname}</span>}
      {realm && <span className="muted"> {realm}</span>}
    </span>
  );
}
