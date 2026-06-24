import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type UploadPrefix =
  | 'dpr-issues'
  | 'measurements'
  | 'attendance'
  | 'material-receipts'
  | 'expenses'
  | 'company-logo'
  | 'user-photos';

export function useUploadPhoto() {
  return useMutation({
    mutationFn: async ({ prefix, file }: { prefix: UploadPrefix; file: File | Blob }) => {
      const formData = new FormData();
      formData.append('file', file, file instanceof File ? file.name : 'photo.jpg');
      const { data } = await apiClient.post<{ url: string }>(`/uploads/${prefix}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.url;
    },
  });
}
