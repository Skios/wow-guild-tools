import { useSpecInfo } from '../context';
import { SpecIcon } from './SpecIcon';

/** Small icons for the specs after the main one, in order. */
export function OffSpecs({ classId, offSpecs }: { classId: string; offSpecs: string[] }) {
  const info = useSpecInfo(classId);
  if (offSpecs.length === 0) return null;
  const described = offSpecs.map(id => ({ id, ...info(id) }));
  const nameOf = (d: (typeof described)[number]) => (d.roleLabel ? `${d.label} (${d.roleLabel})` : d.label);
  return (
    <span className="offspecs" role="group" aria-label={`Off-specs: ${described.map(nameOf).join(', ')}`}>
      {described.map(d => (
        <span key={d.id} className="offspec" aria-hidden="true" title={nameOf(d)}>
          {d.role ? <SpecIcon classId={classId} spec={d.id} role={d.role} size={16} /> : '?'}
        </span>
      ))}
    </span>
  );
}
