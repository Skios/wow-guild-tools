import { formatDateTime } from '../format';

/** "Contacted Sat 17 Oct 09:00, 20:15": each time an officer messaged them from the event page. */
export function ContactedLine({ at }: { at: string[] | undefined }) {
  if (!at?.length) return null;
  return <span className="contacted">Contacted {at.map(formatDateTime).join(', ')}</span>;
}
