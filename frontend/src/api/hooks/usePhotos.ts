import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type PhotoEntityType = 'DPR_ISSUE' | 'MEASUREMENT' | 'MATERIAL_RECEIPT' | 'ATTENDANCE';

export interface ProjectPhotoCreateInput {
  entity_type: PhotoEntityType;
  entity_id: string;
  photo_url: string;
  latitude?: number;
  longitude?: number;
  captured_at: string;
}

export function useAttachPhoto() {
  return useMutation({
    mutationFn: async (data: ProjectPhotoCreateInput) => (await apiClient.post('/photos', data)).data,
  });
}
