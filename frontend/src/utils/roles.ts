import type { UserRole } from '@/store/auth-store';

export const ROLE_LABELS: Record<UserRole, string> = {
  SITE_ENGINEER: 'Site Engineer',
  PROJECT_MANAGER: 'Project Manager',
  QUANTITY_SURVEYOR: 'Quantity Surveyor',
  STORE_KEEPER: 'Store Keeper',
  ADMIN: 'Administrator',
};
