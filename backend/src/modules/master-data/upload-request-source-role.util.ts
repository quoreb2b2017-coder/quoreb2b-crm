/** Roles stored on master_data_upload_requests (matches missing-data source roles). */
export const UPLOAD_REQUEST_SOURCE_ROLES = [
  'employee',
  'db_admin',
  'master',
  'admin',
  'super_admin',
] as const;

export type UploadRequestSourceRole = (typeof UPLOAD_REQUEST_SOURCE_ROLES)[number];

export function normalizeUploadRequestSourceRole(
  role?: string | null,
): UploadRequestSourceRole {
  const r = String(role ?? '').trim();
  if ((UPLOAD_REQUEST_SOURCE_ROLES as readonly string[]).includes(r)) {
    return r as UploadRequestSourceRole;
  }
  if (r === 'admin' || r === 'super_admin' || r === 'master') {
    return r as UploadRequestSourceRole;
  }
  return 'db_admin';
}
