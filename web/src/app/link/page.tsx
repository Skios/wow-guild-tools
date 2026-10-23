'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { rememberLinkToken } from '../../telegramLink';

// The bot's link lands here. Keep its token; the account page asks to confirm the link.
export default function LinkPage() {
  const router = useRouter();
  useEffect(() => {
    rememberLinkToken();
    router.replace('/account');
  }, [router]);
  return null;
}
