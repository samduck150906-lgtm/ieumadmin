'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save, Shield, Bell, Globe, Database, FileText, DollarSign, Mail } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { getSiteSettings, updateSiteSettings } from '@/lib/api/settings';
import { showError, showSuccess } from '@/lib/toast';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [saving, setSaving] = useState(false);

  // 비밀번호 변경
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');

  type NotificationPrefs = { newRequest: boolean; assignComplete: boolean; withdrawRequest: boolean; paymentComplete: boolean };
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    newRequest: true,
    assignComplete: true,
    withdrawRequest: true,
    paymentComplete: true,
  });

  // 서비스 설정
  const [serviceSettings, setServiceSettings] = useState({
    serviceName: '이음',
    contactPhone: '1833-9413',
    commissionRate: 5,
    referralDuration: 12,
    autoCompleteEnabled: true,
    autoCompleteDays: 1,
    defaultInviteMessage: '',
  });

  useEffect(() => {
    getSiteSettings().then((s) => {
      if (s) {
        setServiceSettings({
          serviceName: s.service_name,
          contactPhone: s.contact_phone,
          commissionRate: Number(s.commission_rate),
          referralDuration: s.referral_duration_months,
          autoCompleteEnabled: s.auto_complete_enabled,
          autoCompleteDays: s.auto_complete_days,
          defaultInviteMessage: s.default_invite_message ?? '',
        });
        const prefs = s.notification_prefs;
        if (prefs) {
          setNotifications({
            newRequest: prefs.newRequest ?? true,
            assignComplete: prefs.assignComplete ?? true,
            withdrawRequest: prefs.withdrawRequest ?? true,
            paymentComplete: prefs.paymentComplete ?? true,
          });
        }
      }
    });
  }, []);

  const handleChangePassword = async () => {
    setPasswordError('');
    
    if (passwords.new !== passwords.confirm) {
      setPasswordError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (passwords.new.length < 8) {
      setPasswordError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({ password: passwords.new });
      if (error) throw error;
      showSuccess('비밀번호가 변경되었습니다.');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : '변경 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateSiteSettings({
        service_name: serviceSettings.serviceName,
        contact_phone: serviceSettings.contactPhone,
        commission_rate: serviceSettings.commissionRate,
        referral_duration_months: serviceSettings.referralDuration,
        auto_complete_enabled: serviceSettings.autoCompleteEnabled,
        auto_complete_days: serviceSettings.autoCompleteDays,
        default_invite_message: serviceSettings.defaultInviteMessage || null,
      });
      showSuccess('설정이 저장되었습니다.');
    } catch (e) {
      showError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>

        {/* 계정 정보 */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-medium">계정 정보</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
              <input className="input bg-gray-50" value={user?.email || ''} disabled />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
              <input className="input bg-gray-50" value={user?.name || ''} disabled />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">권한</label>
              <input className="input bg-gray-50" value={user?.role === 'admin' ? '관리자' : '스태프'} disabled />
            </div>
          </CardBody>
        </Card>

        {/* 비밀번호 변경 */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-600" />
            <h2 className="text-lg font-medium">비밀번호 변경</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {passwordError && (
              <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{passwordError}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <input type="password" className="input" placeholder="8자 이상" value={passwords.new} onChange={(e) => setPasswords({...passwords, new: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
              <input type="password" className="input" placeholder="다시 입력" value={passwords.confirm} onChange={(e) => setPasswords({...passwords, confirm: e.target.value})} />
            </div>
            <Button onClick={handleChangePassword} disabled={saving} variant="primary">
              <Save className="h-4 w-4 mr-2" />비밀번호 변경
            </Button>
          </CardBody>
        </Card>

        {/* DB 가격 / 수익 배분 설정 */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-medium">DB 가격 / 수익 배분 설정</h2>
            </span>
            <Link href="/settings/db-prices">
              <Button variant="secondary" size="sm">설정 열기</Button>
            </Link>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-gray-500">
              서비스 카테고리별 DB 판매 가격, 공인중개사 수익쉐어 기본값, 파트너 결제 요청 기본값을 관리합니다.
            </p>
          </CardBody>
        </Card>

        {/* 폼메일 설정 */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-medium">폼메일 설정</h2>
            </span>
            <Link href="/settings/formmail">
              <Button variant="secondary" size="sm">설정 열기</Button>
            </Link>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-gray-500">
              서비스 항목 추가/삭제/순서, 고객 초대 기본 문구, 공인중개사별 전용 문구를 관리합니다.
            </p>
          </CardBody>
        </Card>

        {/* 약관 관리 */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-medium">약관 및 정책</h2>
            </span>
            <Link href="/settings/terms">
              <Button variant="secondary" size="sm">약관 관리</Button>
            </Link>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-gray-500">이용약관, 개인정보처리방침, 제3자 제공동의, 오픈소스 라이선스 본문을 등록·수정합니다. 앱 「약관 및 정책」 화면에 게시됩니다.</p>
          </CardBody>
        </Card>

        {/* 서비스 설정 */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-medium">서비스 설정</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">서비스명</label>
                <input className="input" value={serviceSettings.serviceName} onChange={(e) => setServiceSettings({...serviceSettings, serviceName: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">고객센터 번호</label>
                <input className="input" value={serviceSettings.contactPhone} onChange={(e) => setServiceSettings({...serviceSettings, contactPhone: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">수수료율 (%)</label>
                <input type="number" className="input" value={serviceSettings.commissionRate} onChange={(e) => setServiceSettings({...serviceSettings, commissionRate: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">추천 수익 기간 (개월)</label>
                <input type="number" className="input" value={serviceSettings.referralDuration} onChange={(e) => setServiceSettings({...serviceSettings, referralDuration: Number(e.target.value)})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">고객 초대 기본 문구 (변동 구간)</label>
              <p className="text-xs text-gray-500 mb-1">공인중개사 앱에서 고객에게 보낼 폼메일 문구. 수정 시 해당 부동산 전용 문구로 저장 가능.</p>
              <textarea
                className="input min-h-[120px]"
                placeholder="안녕하세요 &quot;부동산명&quot;입니다.&#10;이사, 청소, 인테리어..."
                value={serviceSettings.defaultInviteMessage}
                onChange={(e) => setServiceSettings({ ...serviceSettings, defaultInviteMessage: e.target.value })}
                rows={5}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="autoComplete"
                checked={serviceSettings.autoCompleteEnabled}
                onChange={(e) => setServiceSettings({...serviceSettings, autoCompleteEnabled: e.target.checked})}
                className="rounded border-gray-300"
              />
              <label htmlFor="autoComplete" className="text-sm">
                시공일 + {serviceSettings.autoCompleteDays}일 후 자동 전체완료 전환
              </label>
            </div>
            <Button onClick={handleSaveSettings} disabled={saving} variant="primary">
              <Save className="h-4 w-4 mr-2" />설정 저장
            </Button>
          </CardBody>
        </Card>

        {/* 알림 설정 */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-medium">알림 설정</h2>
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setSaving(true);
                try {
                  await updateSiteSettings({
                    notification_prefs: {
                      newRequest: notifications.newRequest,
                      assignComplete: notifications.assignComplete,
                      withdrawRequest: notifications.withdrawRequest,
                      paymentComplete: notifications.paymentComplete,
                    },
                  });
                  showSuccess('알림 설정이 저장되었습니다.');
                } catch (e) {
                  showError(e instanceof Error ? e.message : '저장 실패');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              저장
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {[
              { key: 'newRequest', label: '새 서비스 요청 알림' },
              { key: 'assignComplete', label: '배정 완료 알림' },
              { key: 'withdrawRequest', label: '출금 신청 알림' },
              { key: 'paymentComplete', label: '결제 완료 알림' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between py-2">
                <span className="text-sm">{item.label}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications[item.key as keyof NotificationPrefs]}
                    onChange={(e) => setNotifications({...notifications, [item.key]: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* 로그아웃 */}
        <Card>
          <CardBody>
            <Button onClick={signOut} variant="secondary" className="text-red-600 w-full">
              로그아웃
            </Button>
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
