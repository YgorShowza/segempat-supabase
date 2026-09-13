import { apiRequest } from "@/lib/backend/api-client";

export interface PracticalGenerationResult {
  month: string;
  created: number;
  skipped: number;
  suspended: number;
  due_templates: number;
}

export function generatePracticalEvaluationsMonth(
  month: string,
  templateId?: string | null,
): Promise<PracticalGenerationResult> {
  return apiRequest<PracticalGenerationResult>(
    "/api/operations/practical-evaluations/generate-month",
    {
      method: "POST",
      body: JSON.stringify({
        month,
        ...(templateId ? { template_id: templateId } : {}),
      }),
    },
  );
}
