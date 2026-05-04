import { User } from '@/types';

export function getHomeRoute(user: User, needsPassphrase: boolean): string {
  if (user.role === 'pelanggan' && needsPassphrase) return '/setup-passphrase';
  if (user.role === 'admin') return '/admin/dashboard';
  if (user.role === 'publisher') {
    if (user.approval_status === 'draft') return '/publisher/complete-profile';
    if (user.approval_status === 'pending' || user.approval_status === 'rejected') return '/publisher/pending';
    return '/publisher/dashboard'; // approved atau string kosong (akun lama)
  }
  return '/dashboard';
}
