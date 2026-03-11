import api from './api';
import type { Property } from '@/types/property';
import type { PaginationParams, PaginatedResponse, FilterParams, StatusType } from '@/types/common';

export interface PropertyListParams extends PaginationParams, Omit<FilterParams, 'status'> {
  search?: string;
  status?: StatusType | string;
  type?: string;
}

export interface CreatePropertyParams {
  complex_name?: string | null;
  address_short?: string | null;
  address_detail?: string | null;
  price_display?: number | null;
  area_sqm?: number | null;
  property_type?: string | null;
  image_url?: string | null;
  contact_phone?: string | null;
  seller_info?: string | null;
  region_level1?: string | null;
  region_level2?: string | null;
  region_level3?: string | null;
}

export const propertyService = {
  async getList(params: PropertyListParams): Promise<PaginatedResponse<Property>> {
    const { data } = await api.get<PaginatedResponse<Property>>('/api/admin/properties', { params });
    return data;
  },
  async getById(id: string): Promise<Property> {
    const { data } = await api.get<Property>(`/api/admin/properties/${id}`);
    return data;
  },
  async create(params: CreatePropertyParams): Promise<Property> {
    const { data } = await api.post<Property>('/api/admin/properties', params);
    return data;
  },
};
