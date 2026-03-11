import { redirect } from 'next/navigation';

/** /affiliate → /affiliate/dashboard (AFFILIATE_NAV_ITEMS와 일치) */
export default function AffiliatePage() {
  redirect('/affiliate/dashboard');
}
