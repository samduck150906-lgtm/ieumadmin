import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface AuthSession {
  userId: string;
  role: 'staff' | 'partner' | 'realtor' | 'admin';
  partnerId?: string;
  realtorId?: string;
  isAdmin?: boolean;
  /** 정산 담당자만 출금 승인/완료/반려 가능. 관리자(isAdmin)는 항상 가능 */
  canApproveSettlement?: boolean;
}

export async function verifySession(request: NextRequest): Promise<AuthSession | null> {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required Supabase environment variables');
      return null;
    }

    let userId: string | undefined;

    // 1차: Authorization Bearer가 있으면 우선 사용 (API 호출 시 클라이언트가 토큰을 명시적으로 보낼 때 쿠키 미전달 이슈 방지)
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace(/Bearer\s+/i, '')?.trim() || '';
    if (token) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user: tokenUser }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && tokenUser) userId = tokenUser.id;
    }

    // 2차: Bearer 없거나 실패 시 쿠키 기반 세션 검증 (API 라우트에서 쿠키 미전달 이슈 대비)
    if (!userId && supabaseAnonKey) {
      try {
        let cookieStore: { getAll: () => { name: string; value: string }[] };
        if (typeof request.cookies?.getAll === 'function') {
          cookieStore = request.cookies;
        } else {
          const nextCookies = await cookies();
          const list = nextCookies.getAll();
          // next/headers cookies()가 비어 있으면 Cookie 헤더에서 직접 파싱 (같은 출처 fetch 시 전달되는 쿠키 보강)
          if (list.length === 0) {
            const cookieHeader = request.headers.get('cookie');
            if (cookieHeader) {
              const parsed = cookieHeader.split(';').map((s) => {
                const raw = s.trim();
                const eq = raw.indexOf('=');
                if (eq < 0) return { name: raw, value: '' };
                return { name: raw.slice(0, eq).trim(), value: raw.slice(eq + 1).trim() };
              }).filter((c) => c.name);
              cookieStore = { getAll: () => parsed };
            } else {
              cookieStore = nextCookies;
            }
          } else {
            cookieStore = nextCookies;
          }
        }
        const supabaseSSR = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll() {
              // API 라우트에서는 응답 쿠키 설정 불필요
            },
          },
        });
        const { data: { user: cookieUser } } = await supabaseSSR.auth.getUser();
        if (cookieUser) userId = cookieUser.id;
      } catch {
        // 쿠키 접근 실패 시 무시
      }
    }

    if (!userId) return null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, role, status')
      .eq('id', userId)
      .single();

    if (userError || !userData || userData.status !== 'active') return null;

    const session: AuthSession = {
      userId: userData.id,
      role: userData.role as 'staff' | 'partner' | 'realtor' | 'admin',
    };

    if (userData.role === 'partner') {
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', userId)
        .single();
      session.partnerId = partner?.id;
    }

    if (userData.role === 'realtor') {
      const { data: realtor } = await supabase
        .from('realtors')
        .select('id')
        .eq('user_id', userId)
        .single();
      session.realtorId = realtor?.id;
    }

    if (userData.role === 'staff' || userData.role === 'admin') {
      const { data: staff } = await supabase
        .from('staff')
        .select('is_admin, can_approve_settlement')
        .eq('user_id', userId)
        .single();
      session.isAdmin = staff?.is_admin ?? false;
      session.canApproveSettlement = staff?.can_approve_settlement ?? false;
    }
    if (userData.role === 'admin') {
      session.isAdmin = true;
      session.canApproveSettlement = true;
    }

    return session;
  } catch {
    return null;
  }
}

export async function verifyStaffSession(request: NextRequest): Promise<AuthSession | null> {
  const session = await verifySession(request);
  if (!session || (session.role !== 'staff' && session.role !== 'admin')) return null;
  return session;
}

export async function verifyAdminSession(request: NextRequest): Promise<AuthSession | null> {
  const session = await verifySession(request);
  if (!session) return null;
  // admin 역할이거나, staff이면서 isAdmin인 경우 허용
  if (session.role === 'admin') return session;
  if (session.role === 'staff' && session.isAdmin) return session;
  return null;
}

export async function verifyPartnerSession(request: NextRequest): Promise<AuthSession | null> {
  const session = await verifySession(request);
  if (!session || (session.role !== 'partner' && session.role !== 'realtor')) return null;
  return session;
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}
