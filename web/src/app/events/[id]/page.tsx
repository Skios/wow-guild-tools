'use client';
import { useParams } from 'next/navigation';
import { EventView } from '../../../components/EventView';

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  return <EventView id={id} />;
}
