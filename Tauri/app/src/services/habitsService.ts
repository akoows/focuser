import { apiRequest } from "./api";
import type { ApiCheckIn, ApiDashboard, ApiFrequency, ApiHabit } from "../types/api";

type HabitsResponse = {
  items: ApiHabit[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type CheckInsResponse = {
  items: ApiCheckIn[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TodayCheckInsResponse = {
  date: string;
  items: ApiCheckIn[];
};

type HabitResponse = { habit: ApiHabit };
type CheckInResponse = { checkIn: ApiCheckIn };

export type HabitInput = {
  name: string;
  description: string | null;
  frequency: ApiFrequency;
  daysOfWeek: number[];
};

export function listHabits(): Promise<HabitsResponse> {
  return apiRequest("/habits?status=active&page=1&limit=100");
}

export function getTodayCheckIns(): Promise<TodayCheckInsResponse> {
  return apiRequest("/check-ins/today");
}

export function getDashboard(): Promise<ApiDashboard> {
  return apiRequest("/dashboard");
}

export async function getHabitCheckIns(
  habitId: string,
  from: string,
  to: string
): Promise<ApiCheckIn[]> {
  const query = new URLSearchParams({ from, to, page: "1", limit: "100" });
  const response = await apiRequest<CheckInsResponse>(
    `/habits/${encodeURIComponent(habitId)}/check-ins?${query}`
  );
  return response.items;
}

export async function createHabit(input: HabitInput): Promise<ApiHabit> {
  const response = await apiRequest<HabitResponse>("/habits", {
    method: "POST",
    body: input,
  });
  return response.habit;
}

export async function updateHabit(id: string, input: HabitInput): Promise<ApiHabit> {
  const response = await apiRequest<HabitResponse>(`/habits/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
  return response.habit;
}

export async function deleteHabit(id: string): Promise<void> {
  await apiRequest<{ deleted: boolean }>(`/habits/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function createCheckIn(habitId: string): Promise<ApiCheckIn> {
  const response = await apiRequest<CheckInResponse>(
    `/habits/${encodeURIComponent(habitId)}/check-ins`,
    { method: "POST", body: {} }
  );
  return response.checkIn;
}

export async function deleteCheckIn(habitId: string, checkInId: string): Promise<void> {
  await apiRequest<{ deleted: boolean }>(
    `/habits/${encodeURIComponent(habitId)}/check-ins/${encodeURIComponent(checkInId)}`,
    { method: "DELETE" }
  );
}
