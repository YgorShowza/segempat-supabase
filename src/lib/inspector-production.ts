import { apiRequest, buildSegempatApiUrl } from "@/lib/backend/api-client";

export type InspectorProductionStatus = "Registrada" | "Cancelada";

export interface InspectorProductionMember {
  employee_id: string;
  full_name: string;
  matricula: string;
  sector: string;
  status: string;
  is_leader: boolean;
  active: boolean;
  display_order: number;
}

export interface InspectorProductionMembership {
  current_member: InspectorProductionMember | null;
  members: InspectorProductionMember[];
  categories: string[];
}

export interface InspectorProductionEntry {
  id: string;
  executor_employee_id: string;
  executor_user_id: string;
  executor_name: string;
  executor_matricula: string;
  title: string;
  category: string;
  details: string;
  location: string | null;
  status: InspectorProductionStatus;
  executed_at: string;
  canceled_at: string | null;
  canceled_by: string | null;
  canceled_by_name: string | null;
  canceled_reason: string | null;
  created_at: string;
  updated_at: string;
  attachment_count: number;
  is_leader?: boolean;
}

export interface InspectorProductionAttachment {
  id: string;
  entry_id: string;
  original_name: string;
  mime_type: "image/png" | "image/jpeg";
  size_bytes: number;
  caption: string | null;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

export interface InspectorProductionEntryDetails extends InspectorProductionEntry {
  attachments: InspectorProductionAttachment[];
}

export interface InspectorProductionRankingRow {
  employee_id: string;
  name: string;
  matricula: string;
  is_leader: boolean;
  display_order: number;
  total: number;
  previous_total: number;
  absolute_change: number;
  percentage_change: number | null;
  comparison_baseline_available: boolean;
  with_evidence: number;
  without_evidence: number;
  evidence_rate: number;
  last_execution_at: string | null;
  rank: number;
  share: number;
}

export interface InspectorProductionSummary {
  period: { from: string; to: string };
  previous_period: { from: string; to: string; inclusive_days: number };
  comparison: {
    current_total: number;
    previous_total: number;
    absolute_change: number;
    percentage_change: number | null;
    baseline_available: boolean;
  };
  generated_at: string;
  totals: {
    executions: number;
    configured_inspectors: number;
    participating_inspectors: number;
    average_per_inspector: number;
    with_evidence: number;
    without_evidence: number;
    evidence_rate: number;
    without_evidence_rate: number;
    canceled: number;
  };
  ranking: InspectorProductionRankingRow[];
  categories: Array<{ category: string; total: number; share: number }>;
  timeline: Array<{ day: string; executor_employee_id: string; executor_name: string; total: number }>;
  recent: InspectorProductionEntry[];
}

export interface InspectorProductionSuggestion {
  title: string;
  category: string;
  frequency: number;
  last_used: string;
}

export interface InspectorProductionInspectorDetails {
  member: InspectorProductionMember;
  period: { from: string; to: string };
  previous_period: { from: string; to: string; inclusive_days: number };
  metrics: {
    executions: number;
    previous_executions: number;
    absolute_change: number;
    percentage_change: number | null;
    comparison_baseline_available: boolean;
    participation_share: number;
    with_evidence: number;
    without_evidence: number;
    evidence_rate: number;
    canceled: number;
    last_execution_at: string | null;
  };
  categories: Array<{ category: string; total: number; share: number }>;
  timeline: Array<{ day: string; total: number }>;
  recent: InspectorProductionEntry[];
}

export interface InspectorProductionEntryPage {
  items: InspectorProductionEntry[];
  total: number;
  next_offset: number | null;
}

function periodQuery(from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  return params.toString();
}

export function getInspectorProductionMembership(): Promise<InspectorProductionMembership> {
  return apiRequest<InspectorProductionMembership>("/api/inspector-production/membership");
}

export function getInspectorProductionSummary(from: string, to: string): Promise<InspectorProductionSummary> {
  return apiRequest<InspectorProductionSummary>(`/api/inspector-production/summary?${periodQuery(from, to)}`);
}

export function getInspectorProductionInspectorDetails(
  employeeId: string,
  from: string,
  to: string,
): Promise<InspectorProductionInspectorDetails> {
  return apiRequest<InspectorProductionInspectorDetails>(
    `/api/inspector-production/inspectors/${encodeURIComponent(employeeId)}?${periodQuery(from, to)}`,
  );
}

export function listInspectorProductionEntries(input: {
  from: string;
  to: string;
  employee_id?: string;
  category?: string;
  status?: InspectorProductionStatus | "";
  evidence?: "with" | "without" | "";
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<InspectorProductionEntryPage> {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    limit: String(input.limit ?? 100),
    offset: String(input.offset ?? 0),
  });
  if (input.employee_id) params.set("employee_id", input.employee_id);
  if (input.category) params.set("category", input.category);
  if (input.status) params.set("status", input.status);
  if (input.evidence) params.set("evidence", input.evidence);
  if (input.search?.trim()) params.set("search", input.search.trim());
  return apiRequest<InspectorProductionEntryPage>(`/api/inspector-production/entries?${params.toString()}`);
}

export function listInspectorProductionSuggestions(query = ""): Promise<InspectorProductionSuggestion[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.toString();
  return apiRequest<InspectorProductionSuggestion[]>(`/api/inspector-production/suggestions${suffix ? `?${suffix}` : ""}`);
}

export function getInspectorProductionEntry(id: string): Promise<InspectorProductionEntryDetails> {
  return apiRequest<InspectorProductionEntryDetails>(`/api/inspector-production/entries/${encodeURIComponent(id)}`);
}

export function createInspectorProductionEntry(input: {
  title: string;
  category: string;
  details: string;
  location?: string | null;
}): Promise<InspectorProductionEntry> {
  return apiRequest<InspectorProductionEntry>("/api/inspector-production/entries", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelInspectorProductionEntry(id: string, reason: string) {
  await apiRequest(`/api/inspector-production/entries/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function addInspectorProductionAttachment(
  id: string,
  input: { data_url: string; original_name: string; caption?: string | null },
) {
  await apiRequest(`/api/inspector-production/entries/${encodeURIComponent(id)}/attachments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function inspectorProductionAttachmentUrl(entryId: string, attachmentId: string) {
  return buildSegempatApiUrl(
    `/api/inspector-production/entries/${encodeURIComponent(entryId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}
