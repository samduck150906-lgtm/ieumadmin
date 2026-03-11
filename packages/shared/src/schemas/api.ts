/**
 * API 요청/응답 계약 (zod) — 단일 소스로 런타임 검증 + 타입 추론
 */

import { z } from 'zod';

const VALID_CATEGORIES = [
  'moving',
  'cleaning',
  'internet_tv',
  'interior',
  'appliance_rental',
  'kiosk',
] as const;
const PHONE_REGEX = /^01[016789]\d{7,8}$/;

/** 고객 신청 (apply) API body */
export const customerApplyBodySchema = z
  .object({
    realtorId: z.string().optional(),
    name: z.string().min(1, '이름을 입력해 주세요.').max(100),
    phone: z.string().regex(PHONE_REGEX, '휴대폰 번호 형식이 올바르지 않습니다.'),
    movingDate: z.string().optional(),
    moving_date: z.string().optional(),
    currentAddress: z.string().optional(),
    movingAddress: z.string().optional(),
    moving_address: z.string().optional(),
    areaSize: z.string().optional(),
    area_size: z.string().optional(),
    movingType: z.string().optional(),
    moving_type: z.string().optional(),
    selectedServices: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
    source_realtor_id: z.string().nullable().optional(),
    source_url: z.string().nullable().optional(),
    from_address: z.string().optional(),
    has_elevator_from: z.boolean().optional(),
    has_elevator_to: z.boolean().optional(),
    internet_type: z.string().optional(),
    current_internet: z.string().optional(),
    preferred_internet: z.string().optional(),
    cleaning_type: z.string().optional(),
    cleaning_date: z.string().optional(),
    memo: z.string().optional(),
  })
  .refine(
    (data) => {
      const services = data.selectedServices ?? data.services ?? [];
      return services.every((s) => VALID_CATEGORIES.includes(s as (typeof VALID_CATEGORIES)[number]));
    },
    { message: '지원하지 않는 서비스 카테고리입니다.', path: ['selectedServices'] }
  );

export type CustomerApplyBody = z.infer<typeof customerApplyBodySchema>;

/** 제휴업체 신청 (partner apply) API body */
export const partnerApplyBodySchema = z.object({
  business_name: z.string().min(1, '상호를 입력해 주세요.').max(200),
  business_number: z.string().max(50).optional(),
  representative_name: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  contact_phone: z.string().max(20).optional(),
  manager_name: z.string().min(1, '담당자명을 입력해 주세요.').max(100),
  manager_phone: z.string().min(1, '담당자 연락처를 입력해 주세요.').max(20),
  manager_email: z.string().email().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  service_categories: z.array(z.string()).optional(),
  category: z.string().optional(),
  introduction: z.string().max(2000).optional(),
  service_realtor: z.boolean().optional(),
  service_moving: z.boolean().optional(),
  service_cleaning: z.boolean().optional(),
  service_internet: z.boolean().optional(),
  service_interior: z.boolean().optional(),
  service_etc: z.boolean().optional(),
});

export type PartnerApplyBody = z.infer<typeof partnerApplyBodySchema>;
