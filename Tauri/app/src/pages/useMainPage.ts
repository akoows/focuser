import { useEffect, useState, type AnimationEvent, type FormEvent } from "react";

type Habit = {
  id: string;
  title: string;
  description: string;
  timesPerWeek: number;
  completionDates: string[];
};

type FocusSession = {
  id: string;
  endedAt: number;
  durationSeconds: number;
};

type FocusDay = {
  key: string;
  label: string;
  totalSeconds: number;
};

type MonthCell = {
  day: number;
  dateKey: string;
};

const HABITS_STORAGE_KEY = "focuser.habits";
const THEME_STORAGE_KEY = "focuser.theme";

const initialHabits: Habit[] = [
  {
    id: "react",
    title: "Estudar React",
    description: "Revisar componentes e praticar hooks.",
    timesPerWeek: 3,
    completionDates: [],
  },
  {
    id: "workout",
    title: "Treinar",
    description: "Fazer uma sessão de treino e alongamento.",
    timesPerWeek: 4,
    completionDates: [],
  },
  {
    id: "reading",
    title: "Ler 20 páginas",
    description: "Avançar na leitura do livro atual.",
    timesPerWeek: 5,
    completionDates: [],
  },
];

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function loadHabits(): Habit[] {
  try {
    const savedHabits = window.localStorage.getItem(HABITS_STORAGE_KEY);
    if (!savedHabits) return initialHabits;

    const parsedHabits: unknown = JSON.parse(savedHabits);
    if (!Array.isArray(parsedHabits)) return initialHabits;

    return parsedHabits.map((habit) => {
      const completionDates = Array.isArray(habit.completionDates) ? habit.completionDates : [];

      return {
        ...habit,
        completionDates: habit.completed && completionDates.length === 0
          ? [getLocalDateKey(new Date())]
          : completionDates,
      };
    }) as Habit[];
  } catch {
    return initialHabits;
  }
}

function loadLightMode() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light";
  } catch {
    return false;
  }
}

function getWeekDateKeys(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const weekDate = new Date(monday);
    weekDate.setDate(monday.getDate() + index);
    return getLocalDateKey(weekDate);
  });
}

function getMonthCalendar(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: MonthCell[] = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return {
      day,
      dateKey: getLocalDateKey(new Date(year, month, day)),
    };
  });

  return {
    title: date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    value: `${year}-${String(month + 1).padStart(2, "0")}`,
    monthIndex: month,
    year,
    leadingEmptyDays: firstWeekday,
    days,
  };
}

function getFocusDays(sessions: FocusSession[]): FocusDay[] {
  const dailyTotals = new Map<string, number>();

  for (const session of sessions) {
    const dateKey = getLocalDateKey(new Date(session.endedAt));
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + session.durationSeconds);
  }

  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index);

    return {
      key: getLocalDateKey(date),
      label: date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" }).replace(".", ""),
      totalSeconds: dailyTotals.get(getLocalDateKey(date)) ?? 0,
    };
  });
}

export function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function formatFocusTotal(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (remainingSeconds > 0) parts.push(`${remainingSeconds} s`);

  return parts.length ? parts.join(" ") : "0 min";
}

export function useMainPage() {
  const [activeTab, setActiveTab] = useState("today");
  const [isLightMode, setIsLightMode] = useState(loadLightMode);
  const [tasks, setTasks] = useState<Habit[]>(loadHabits);
  const [selectedGoalHabitId, setSelectedGoalHabitId] = useState<string | null>(null);
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isTaskDialogClosing, setIsTaskDialogClosing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const [closingTaskMenuId, setClosingTaskMenuId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [timesPerWeek, setTimesPerWeek] = useState(1);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [focusStartedAt, setFocusStartedAt] = useState<number | null>(null);
  const [elapsedFocusSeconds, setElapsedFocusSeconds] = useState(0);
  const [totalFocusSeconds, setTotalFocusSeconds] = useState(0);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [hoveredFocusDay, setHoveredFocusDay] = useState<string | null>(null);
  const todayDate = new Date();
  const todayKey = getLocalDateKey(todayDate);
  const weekDateKeys = getWeekDateKeys(todayDate);
  const monthCalendar = getMonthCalendar(selectedMonthDate);
  const availableYears = Array.from({ length: 12 }, (_, index) => todayDate.getFullYear() - index);
  const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const selectedGoalHabit = tasks.find((habit) => habit.id === selectedGoalHabitId) ?? tasks[0] ?? null;
  const completedHabits = tasks.filter((task) => task.completionDates.includes(todayKey)).length;
  const habitsProgress = tasks.length > 0 ? (completedHabits / tasks.length) * 100 : 0;
  const focusDays = getFocusDays(focusSessions);
  const longestSessionSeconds = focusSessions.reduce(
    (longest, session) => Math.max(longest, session.durationSeconds),
    0
  );
  const largestDailyTotal = focusDays.reduce(
    (largest, day) => Math.max(largest, day.totalSeconds),
    0
  );
  const chartMaxSeconds = Math.max(longestSessionSeconds, largestDailyTotal, 60);
  const chartLeft = 58;
  const chartRight = 708;
  const chartTop = 12;
  const chartBottom = 148;
  const chartPoints = focusDays.map((day, index) => {
    const x = chartLeft + ((chartRight - chartLeft) * index) / (focusDays.length - 1);
    const y = chartBottom - (day.totalSeconds / chartMaxSeconds) * (chartBottom - chartTop);

    return { ...day, x, y };
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      return;
    }
  }, [tasks]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isLightMode ? "light" : "dark");
    } catch {
      return;
    }
  }, [isLightMode]);

  useEffect(() => {
    if (!isFocusActive || focusStartedAt === null) return;

    const updateElapsedTime = () => {
      setElapsedFocusSeconds(Math.floor((Date.now() - focusStartedAt) / 1000));
    };
    const intervalId = window.setInterval(updateElapsedTime, 250);

    return () => window.clearInterval(intervalId);
  }, [focusStartedAt, isFocusActive]);

  function startFocus() {
    setElapsedFocusSeconds(0);
    setFocusStartedAt(Date.now());
    setIsFocusActive(true);
  }

  function handleMonthChange(monthIndex: number) {
    setSelectedMonthDate((currentDate) => new Date(currentDate.getFullYear(), monthIndex, 1));
  }

  function handleYearChange(year: number) {
    setSelectedMonthDate((currentDate) => new Date(year, currentDate.getMonth(), 1));
  }

  function stopFocus() {
    if (focusStartedAt === null) return;

    const sessionSeconds = Math.max(0, Math.floor((Date.now() - focusStartedAt) / 1000));
    const endedAt = Date.now();
    setTotalFocusSeconds((currentTotal) => currentTotal + sessionSeconds);
    if (sessionSeconds > 0) {
      setFocusSessions((currentSessions) => [
        ...currentSessions,
        { id: crypto.randomUUID(), endedAt, durationSeconds: sessionSeconds },
      ]);
    }
    setIsFocusActive(false);
    setFocusStartedAt(null);
    setElapsedFocusSeconds(0);
  }

  function toggleTask(taskId: string) {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) return task;

        const isCompletedToday = task.completionDates.includes(todayKey);
        return {
          ...task,
          completionDates: isCompletedToday
            ? task.completionDates.filter((date) => date !== todayKey)
            : [...task.completionDates, todayKey],
        };
      })
    );
  }

  function openNewTaskDialog() {
    setEditingTaskId(null);
    setTaskTitle("");
    setTaskDescription("");
    setTimesPerWeek(1);
    setIsTaskDialogClosing(false);
    setIsTaskDialogOpen(true);
  }

  function openEditTaskDialog(task: Habit) {
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setTimesPerWeek(task.timesPerWeek);
    closeTaskMenu(task.id);
    setIsTaskDialogClosing(false);
    setIsTaskDialogOpen(true);
  }

  function closeTaskDialog() {
    setIsTaskDialogClosing(true);
  }

  function handleTaskDialogAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && event.animationName === "task-dialog-out") {
      setIsTaskDialogOpen(false);
      setIsTaskDialogClosing(false);
    }
  }

  function closeTaskMenu(taskId: string) {
    setClosingTaskMenuId(taskId);
    setOpenTaskMenuId(null);
  }

  function handleTaskMenuAnimationEnd(event: AnimationEvent<HTMLDivElement>, taskId: string) {
    if (event.target === event.currentTarget && event.animationName === "task-menu-out") {
      setClosingTaskMenuId((currentId) => currentId === taskId ? null : currentId);
    }
  }

  function handleTaskRowAnimationEnd(event: AnimationEvent<HTMLElement>, taskId: string) {
    if (event.target === event.currentTarget && event.animationName === "task-row-out") {
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      setDeletingTaskId(null);
    }
  }

  function handleSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskTitle.trim();
    const description = taskDescription.trim();

    if (!title || !description) return;

    if (editingTaskId) {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === editingTaskId ? { ...task, title, description, timesPerWeek } : task
        )
      );
    } else {
      setTasks((currentTasks) => [
        ...currentTasks,
        {
          id: crypto.randomUUID(),
          title,
          description,
          timesPerWeek,
          completionDates: [],
        },
      ]);
    }

    setTaskTitle("");
    setTaskDescription("");
    setTimesPerWeek(1);
    setEditingTaskId(null);
    closeTaskDialog();
  }

  function deleteTask(taskId: string) {
    setDeletingTaskId(taskId);
    closeTaskMenu(taskId);
  }

  return {
    activeTab,
    setActiveTab,
    isLightMode,
    setIsLightMode,
    tasks,
    selectedGoalHabitId: selectedGoalHabit?.id ?? null,
    setSelectedGoalHabitId,
    selectedGoalHabit,
    isTaskDialogOpen,
    isTaskDialogClosing,
    editingTaskId,
    openTaskMenuId,
    setOpenTaskMenuId,
    closingTaskMenuId,
    setClosingTaskMenuId,
    deletingTaskId,
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    timesPerWeek,
    setTimesPerWeek,
    isFocusActive,
    elapsedFocusSeconds,
    totalFocusSeconds,
    hoveredFocusDay,
    setHoveredFocusDay,
    todayKey,
    completedHabits,
    habitsProgress,
    focusDays,
    chartMaxSeconds,
    chartLeft,
    chartRight,
    chartTop,
    chartBottom,
    chartPoints,
    weekDateKeys,
    monthCalendar,
    availableYears,
    handleMonthChange,
    handleYearChange,
    weekdayLabels,
    toggleTask,
    openNewTaskDialog,
    openEditTaskDialog,
    closeTaskDialog,
    handleTaskDialogAnimationEnd,
    closeTaskMenu,
    handleTaskMenuAnimationEnd,
    handleTaskRowAnimationEnd,
    handleSaveTask,
    deleteTask,
    startFocus,
    stopFocus,
  };
}