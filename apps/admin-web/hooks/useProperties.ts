import { useQuery } from '@tanstack/react-query';
import { propertyService, type PropertyListParams } from '@/services/property.service';

export function usePropertyList(params: PropertyListParams) {
  return useQuery({
    queryKey: ['properties', params],
    queryFn: () => propertyService.getList(params),
    staleTime: 5 * 60 * 1000,
  });
}
