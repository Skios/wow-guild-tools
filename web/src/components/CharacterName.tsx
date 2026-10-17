import { useClassInfo } from '../context';

export function CharacterName({ name, classId, realm }: { name: string; classId: string; realm?: string }) {
  const { color, label } = useClassInfo(classId);
  return (
    <span className="character">
      <strong className="character-name" style={{ color }} title={label}>{name}</strong>
      {realm && <span className="muted"> {realm}</span>}
    </span>
  );
}
