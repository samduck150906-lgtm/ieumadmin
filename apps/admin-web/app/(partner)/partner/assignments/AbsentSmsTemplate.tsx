'use client';

import { useState } from 'react';
import { Phone, Copy, CheckCheck } from 'lucide-react';

/** 부재중 SMS 템플릿 자동 제공 컴포넌트 */
export function AbsentSmsTemplate({
  customerName,
  customerPhone,
  category,
}: {
  customerName: string;
  customerPhone: string;
  category: string;
}) {
  const [copied, setCopied] = useState(false);

  const template = `안녕하세요, ${customerName}님. ${category} 상담 관련하여 연락 드렸으나 통화 연결이 되지 않았습니다. 편하신 시간에 다시 연락 주시면 성심껏 도와드리겠습니다. 감사합니다.`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = template;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 bg-orange-50 rounded-xl space-y-3 border border-orange-200">
      <div className="flex items-center gap-2">
        <Phone className="w-4 h-4 text-orange-600" />
        <h4 className="text-sm font-semibold text-orange-800">부재중 안내 문자 템플릿</h4>
      </div>
      <div className="bg-white rounded-xl p-3 border border-orange-100">
        <p className="text-sm text-gray-700 leading-relaxed">{template}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-orange-600">
        <span>수신번호: {customerPhone}</span>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-orange-500 text-white hover:bg-orange-600'
        }`}
      >
        {copied ? (
          <>
            <CheckCheck className="w-4 h-4" />
            복사 완료!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            문자 내용 복사
          </>
        )}
      </button>
      <p className="text-xs text-orange-500">
        복사 후 문자 앱에서 붙여넣기하여 발송하세요.
      </p>
    </div>
  );
}
