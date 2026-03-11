/**
 * 루트(/) — 미들웨어에서 세션 유무에 따라 /dashboard 또는 /login으로 리다이렉트.
 * 이 페이지는 미들웨어 리다이렉트 시 도달하지 않음. Fallback용.
 */
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}
