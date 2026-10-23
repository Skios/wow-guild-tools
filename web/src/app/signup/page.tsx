'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Signed out, App shows the sign-up form for this path. Signed in, there is nothing to do here.
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => router.replace('/events'), [router]);
  return null;
}
