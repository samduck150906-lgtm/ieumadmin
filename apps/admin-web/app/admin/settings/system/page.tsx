'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getSiteSettings, updateSiteSettings } from '@/lib/api/settings';
import { showError, showSuccess } from '@/lib/toast';
import { Loader2, CheckCircle2, XCircle, ArrowLeft, RefreshCw, Wrench } from 'lucide-react';

type SystemConfig = {
  storage: string;
  storageNote: string;
  config: {
    api: { supabase: { configured: boolean; urlMasked: string; keyMasked: string }; sentry: { configured: boolean; dsnMasked: string } };
    pg: { provider: string; configured: boolean; secretMasked: string };
    sms: { aligo: { configured: boolean; apiKeyMasked: string; userIdMasked: string; sender: string }; kakao: { configured: boolean; restKeyMasked: string; senderKeyMasked: string } };
    email: { configured: boolean; note: string };
  };
} | null;

type TestResults = {
  results: {
    supabase: { ok: boolean; message?: string };
    sms: { ok: boolean; message?: string };
    pg: { ok: boolean; message?: string };
  };
} | null;

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-amber-400'}`} />
  );
}

export default function AdminSettingsSystemPage() {
  const [config, setConfig] = useState<SystemConfig>(null);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<TestResults>(null);
  const [testing, setTesting] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/system', { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || '설정을 불러올 수 없습니다.');
      }
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      showError(e instanceof Error ? e.message : '설정 조회 실패');
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  const runConnectionTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch('/api/admin/settings/system/test', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '테스트 요청 실패');
      setTestResults(data);
      showSuccess('연결 테스트 완료');
    } catch (e) {
      showError(e instanceof Error ? e.message : '연결 테스트 실패');
    } finally {
      setTesting(false);
    }
  };

  const loadMaintenance = () => {
    getSiteSettings().then((s) => {
      setMaintenanceMode(s?.maintenance_mode ?? false);
    });
  };

  const toggleMaintenance = async () => {
    setMaintenanceSaving(true);
    try {
      await updateSiteSettings({ maintenance_mode: !maintenanceMode });
      setMaintenanceMode(!maintenanceMode);
      showSuccess(maintenanceMode ? '점검 모드를 해제했습니다.' : '점검 모드를 켰습니다.');
    } catch (e) {
      showError(e instanceof Error ? e.message : '변경 실패');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    loadMaintenance();
  }, []);

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const c = config?.config;
  const r = testResults?.results;

  const integrations = [
    {
      name: '데이터베이스',
      ok: c?.api?.supabase?.configured ?? false,
      testOk: r?.supabase?.ok,
      testMsg: r?.supabase?.message,
    },
    {
      name: '결제(PG)',
      ok: c?.pg?.configured ?? false,
      testOk: r?.pg?.ok,
      testMsg: r?.pg?.message,
    },
    {
      name: '문자/알림톡',
      ok: (c?.sms?.aligo?.configured || c?.sms?.kakao?.configured) ?? false,
      testOk: r?.sms?.ok,
      testMsg: r?.sms?.message,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Link href="/admin/settings" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">시스템 상태</h1>
      </div>

      {/* 점검 모드 */}
      <Card>
        <CardBody className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${maintenanceMode ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">서비스 점검 모드</p>
              <p className="text-sm text-gray-500">
                {maintenanceMode ? '현재 점검 중입니다. 사용자에게 점검 안내가 표시됩니다.' : '정상 운영 중입니다.'}
              </p>
            </div>
          </div>
          <Button
            variant={maintenanceMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={toggleMaintenance}
            disabled={maintenanceSaving}
            leftIcon={maintenanceSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          >
            {maintenanceSaving ? '저장 중...' : maintenanceMode ? '점검 해제' : '점검 모드 켜기'}
          </Button>
        </CardBody>
      </Card>

      {/* 연동 상태 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <span className="font-semibold text-gray-900">서비스 연동 상태</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={runConnectionTest}
              disabled={testing}
              leftIcon={testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            >
              {testing ? '테스트 중...' : '연결 테스트'}
            </Button>
            <Button variant="secondary" size="sm" onClick={fetchConfig} leftIcon={<RefreshCw className="w-4 h-4" />}>
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          {!config ? (
            <p className="text-sm text-amber-600">연동 정보를 불러오지 못했습니다. 관리자 계정으로 로그인 후 다시 시도해주세요.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {integrations.map((item) => (
                <div key={item.name} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <StatusDot ok={item.ok} />
                    <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${item.ok ? 'text-green-600' : 'text-amber-600'}`}>
                      {item.ok ? '연동됨' : '미설정'}
                    </span>
                    {item.testOk !== undefined && (
                      <span className="flex items-center gap-1 text-xs">
                        {item.testOk ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                        )}
                        {item.testOk ? '정상' : item.testMsg || '실패'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
        <p className="text-sm text-blue-700">
          연동 설정 변경이 필요한 경우, 서버 환경변수를 수정한 후 재배포해주세요.
        </p>
      </div>
    </div>
  );
}
