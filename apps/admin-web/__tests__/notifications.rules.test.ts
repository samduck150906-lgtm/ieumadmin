import fs from 'node:fs';
import path from 'node:path';

function read(relPath: string): string {
  const fullPath = path.join(process.cwd(), relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

describe('알림 7종 규칙 고정 테스트', () => {
  it('고객 신청 완료: 템플릿/변수/eventKey 규칙 유지', () => {
    const src = read('app/api/notifications/send-signup-internal/route.ts');
    expect(src).toContain("templateKey: 'CUSTOMER_APPLY_COMPLETE'");
    expect(src).toContain('variables: { services: servicesStr }');
    expect(src).toContain('const eventKey = customerId ? `signup:${customerId}` : `signup:${phone}:${name}`;');
  });

  it('고객 업체 배정: 고객/제휴 템플릿 및 eventKey 규칙 유지', () => {
    const src = read('app/api/notifications/send-assignment/route.ts');
    expect(src).toContain("templateKey: 'CUSTOMER_PARTNER_ASSIGNED'");
    expect(src).toContain('eventKey: `assignment:customer:${serviceRequestId}`');
    expect(src).toContain('category: categoryLabel');
    expect(src).toContain('partnerName: partner?.business_name || \'\'');
    expect(src).toContain('managerName: partner?.manager_name || \'\'');
    expect(src).toContain('managerPhone: partner?.manager_phone || partner?.contact_phone || \'\'');

    expect(src).toContain("templateKey: 'PARTNER_NEW_ASSIGNMENT'");
    expect(src).toContain('eventKey: `assignment:partner:${serviceRequestId}`');
  });

  it('고객 취소: 템플릿/변수/eventKey 규칙 유지', () => {
    const src = read('app/api/notifications/send-cancel/route.ts');
    expect(src).toContain("templateKey: 'CUSTOMER_CANCELLED'");
    expect(src).toContain('cancelledItems: categoryLabel');
    expect(src).toContain('eventKey: `cancel:${serviceRequestId}`');
  });

  it('고객 완료 후기요청: 템플릿/변수/eventKey 규칙 유지', () => {
    const src = read('app/api/notifications/send-completion-review/route.ts');
    expect(src).toContain("templateKey: 'CUSTOMER_COMPLETED'");
    expect(src).toContain('services: categoryLabel');
    expect(src).toContain('reviewUrl');
    expect(src).toContain('eventKey: `completion:review:${serviceRequestId}`');
  });

  it('제휴 리마인더 3종 + 고객 확인: 템플릿/eventKey 규칙 유지', () => {
    const src = read('app/api/cron/partner-reminders/route.ts');
    expect(src).toContain("templateKey: isConsulting ? 'PARTNER_CONSULTING_REMINDER' : 'PARTNER_UNPROCESSED'");
    expect(src).toContain("eventKey: `partner-reminder:${isConsulting ? 'consulting' : 'd1'}:${pa.id}:${today}`");

    expect(src).toContain("templateKey: 'PARTNER_RESERVATION_OVERDUE'");
    expect(src).toContain('eventKey: `partner-reminder:reservation-overdue:${pa.id}:${today}`');

    expect(src).toContain("templateKey: 'CUSTOMER_WORK_CONFIRM'");
    expect(src).toContain('eventKey: `customer-work-confirm:${pa.id}:${today}`');
  });
});
