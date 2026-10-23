'use client';
import { UsersView } from '../../components/UsersView';
import { useOfficer } from '../../context';

export default function UsersPage() {
  return <UsersView me={useOfficer()} />;
}
