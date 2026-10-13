export type ApiUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiFrequency = "DAILY" | "CUSTOM";

export type ApiHabit = {
  id: string;
  name: string;
  description: string | null;
  frequency: ApiFrequency;
  daysOfWeek: number[];
  isActive: boolean;
  startDateKey: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiCheckIn = {
  id: string;
  habitId: string;
  dateKey: string;
  completedAt: string;
  createdAt: string;
};

export type ApiDashboard = {
  date: string;
  totalActiveHabits: number;
  scheduled: number;
  completed: number;
  pending: number;
  completionRate: number;
  habits: Array<{ name: string; completed: boolean }>;
  progress: {
    last7Days: {
      activeHabits: number;
      scheduled: number;
      completed: number;
      completionRate: number;
      pending: number;
    };
    currentStreak: number;
    bestStreak: number;
  };
};
