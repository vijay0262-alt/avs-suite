import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAMES } from '@/lib/cookie-config';

export default async function RootPage() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(COOKIE_NAMES.ACCESS_TOKEN);

  if (hasSession) {
    redirect('/dashboard');
  }
  redirect('/login');
}
