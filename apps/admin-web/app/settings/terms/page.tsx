'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save, FileText, ArrowLeft } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { getSiteTerms, updateSiteTerm, type SiteTermRow } from '@/lib/api/settings';
import { showError, showSuccess } from '@/lib/toast';

const TERM_KEYS: { key: SiteTermRow['key']; label: string }[] = [
  { key: 'terms', label: '이용약관' },
  { key: 'privacy', label: '개인정보처리방침' },
  { key: 'privacy_third', label: '개인정보 제3자 제공동의' },
  { key: 'oss', label: '오픈소스 라이선스' },
];

export default function SettingsTermsPage() {
  const [terms, setTerms] = useState<Record<string, SiteTermRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    getSiteTerms()
      .then((rows) => {
        const map: Record<string, SiteTermRow> = {};
        rows.forEach((r) => (map[r.key] = r));
        TERM_KEYS.forEach(({ key }) => {
          if (!map[key]) map[key] = { key, title: key, body: '', updated_at: '' };
        });
        setTerms(map);
      })
      .catch((e) => showError(e instanceof Error ? e.message : '로드 실패'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    const row = terms[key];
    if (!row) return;
    setSavingKey(key);
    try {
      await updateSiteTerm(key, row.title, row.body);
      showSuccess('저장되었습니다.');
    } catch (e) {
      showError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Link href="/settings" className="p-1 rounded hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">약관 및 정책 관리</h1>
        </div>
        <p className="text-sm text-gray-500">
          아래 내용은 앱의 「약관 및 정책」 화면에 그대로 게시됩니다. 비워두면 앱에서 기본 문구를 표시합니다.
        </p>

        {loading ? (
          <div className="text-gray-500">로딩 중...</div>
        ) : (
          TERM_KEYS.map(({ key, label }) => (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-600" />
                  {label}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleSave(key)}
                  disabled={savingKey === key}
                >
                  {savingKey === key ? '저장 중...' : <><Save className="h-4 w-4 mr-1" />저장</>}
                </Button>
              </CardHeader>
              <CardBody className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                  <input
                    className="input w-full"
                    value={terms[key]?.title ?? ''}
                    onChange={(e) =>
                      setTerms((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], key, title: e.target.value, body: prev[key]?.body ?? '', updated_at: prev[key]?.updated_at ?? '' },
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">본문</label>
                  <textarea
                    className="input w-full min-h-[200px] font-mono text-sm"
                    placeholder="비워두면 앱 기본 문구 표시"
                    value={terms[key]?.body ?? ''}
                    onChange={(e) =>
                      setTerms((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], key, title: prev[key]?.title ?? key, body: e.target.value, updated_at: prev[key]?.updated_at ?? '' },
                      }))
                    }
                    rows={12}
                  />
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
