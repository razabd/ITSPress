import { User } from '@/types';

export function getHomeRoute(user: User, needsPassphrase: boolean): string {
  if (user.role === 'pelanggan' && needsPassphrase) return '/setup-passphrase';
  if (user.role === 'admin') return '/admin/dashboard';
  if (user.role === 'publisher') return '/publisher/dashboard';
  return '/dashboard';
}
