export interface AuditLog {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
}

export interface AuditLogListParams {
  page?: number;
  limit?: number;
  action?: string;
  actor_type?: string;
}
