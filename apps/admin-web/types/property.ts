/**
 * 매물 타입
 */

export interface Property {
  id: string;
  title: string;
  type: PropertyType;
  transactionType: TransactionType;
  price: number;
  deposit?: number;
  monthlyRent?: number;
  area: number;
  address: string;
  detailAddress?: string;
  latitude?: number;
  longitude?: number;
  images: string[];
  description: string;
  partnerId: string;
  partnerName: string;
  status: PropertyStatus;
  viewCount: number;
  inquiryCount: number;
  isMosaic: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PropertyType =
  | 'apartment'
  | 'villa'
  | 'officetel'
  | 'house'
  | 'land'
  | 'commercial';

export type TransactionType = 'sale' | 'jeonse' | 'monthly_rent';

export type PropertyStatus =
  | 'available'
  | 'reserved'
  | 'contracted'
  | 'hidden';
