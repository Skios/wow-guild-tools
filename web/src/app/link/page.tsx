'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { rememberLinkToken } from '../../telegramLink';

// The bot's link lands here. Keep its token; the profile page asks to confirm the link.
export default function LinkPage() {
  const router = useRouter();
  useEffect(() => {
    rememberLinkToken();
    router.replace('/profile');
  }, [router]);
  return null;
}
