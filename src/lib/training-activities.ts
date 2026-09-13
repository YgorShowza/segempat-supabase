import { apiRequest } from "@/lib/backend/api-client";

export type TrainingActivityType = "Simulador" | "Stress Test" | "Desafio Diário" | "Teste Rápido";

export interface TrainingActivityAttempt {
  id: string;
  user_id: string;
  employee_id: string | null;
  employee_name: string;
  employee_matricula: string | null;
  employee_sector: string | null;
  activity_type: TrainingActivityType;
  activity_title: string;
  answers: unknown;
  score: number;
  max_score: number;
  passed: boolean;
  points_earned: number;
  activity_day: string | null;
  created_at: string;
}

export function listMyTrainingActivities(): Promise<TrainingActivityAttempt[]> {
  return apiRequest<TrainingActivityAttempt[]>("/api/me/training/activities");
}

export function submitTrainingActivity(input: {
  activityType: TrainingActivityType;
  activityTitle: string;
  answers: unknown;
  score?: number;
}) {
  return apiRequest<{
    success: boolean;
    attempt_id: string;
    score: number;
    passed: boolean;
    points_earned: number;
    new_points: number;
    level: number;
    activity_day?: string;
    already_rewarded_today?: boolean;
    correct_count?: number;
    question_count?: number;
  }>(`/api/me/training/activities/${encodeURIComponent(input.activityType)}/attempts`, {
    method: "POST",
    body: JSON.stringify({ activityTitle: input.activityTitle, answers: input.answers }),
  });
}
