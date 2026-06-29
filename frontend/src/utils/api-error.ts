import { isAxiosError } from 'axios';

export function getApiErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (!isAxiosError(err)) return fallback;

  if (!err.response) return 'Network error. Please check your connection.';

  const status = err.response.status;
  const data = err.response.data as Record<string, unknown> | undefined;

  if (status >= 500) return 'Something went wrong on the server. Please try again or contact support.';

  // DomainError: {"code": "...", "message": "...", "field_errors": {...}}
  if (typeof data?.message === 'string' && data.message) return data.message;

  // FastAPI HTTPException: {"detail": "..."}
  if (typeof data?.detail === 'string' && data.detail) return data.detail;

  // Pydantic 422 validation errors: {"detail": [{"loc": [...], "msg": "...", "type": "..."}]}
  if (Array.isArray(data?.detail)) {
    const msgs = (data!.detail as Array<{ loc?: string[]; msg?: string }>)
      .map((e) => {
        const field = e.loc?.slice(1).join('.') ?? '';
        return field ? `${field}: ${e.msg}` : e.msg;
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }

  return fallback;
}
