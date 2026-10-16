import { useEffect, useState, type AnimationEvent, type FormEvent } from "react";
import {
  createCheckIn,
  createHabit,
  deleteCheckIn,
  deleteHabit as deleteHabitRequest,
  getDashboard,
  getHabitCheckIns,
  getTodayCheckIns,
  listHabits,
  updateHabit,
} from "../services/habitsService";
import type { ApiCheckIn, ApiDashboard, ApiHabit, ApiFrequency } from "../types/api";

type Habit = {
  id: string;
  title: string;
  description: string;
  timesPerWeek: number;
  frequency: ApiFrequency;
  daysOfWeek: number[];
  completionDates: string[];
  checkInIds: Record<string, string>;
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

const THEME_STORAGE_KEY = "focuser.theme";
const ACCENT_COLOR_STORAGE_KEY = "focuser.accent-color";
const DEFAULT_ACCENT_COLOR = "#ffffff";

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function loadLightMode() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light";
  } catch {
    return false;
  }
}

function toLocalHabit(habit: ApiHabit, checkIns: ApiCheckIn[] = []): Habit {
  const checkInIds = Object.fromEntries(
    checkIns
      .filter((checkIn) => checkIn.habitId === habit.id)
      .map((checkIn) => [checkIn.dateKey, checkIn.id])
  );

  return {
    id: habit.id,
    title: habit.name,
    description: habit.description ?? "",
    timesPerWeek: habit.frequency === "DAILY" ? 7 : habit.daysOfWeek.length,
    frequency: habit.frequency,
    daysOfWeek: habit.daysOfWeek,
    completionDates: Object.keys(checkInIds),
    checkInIds,
  };
}

function toApiHabitInput(
  name: string,
  description: string,
  daysOfWeek: number[]
) {
  const normalizedDays = [...new Set(daysOfWeek)].sort((left, right) => left - right);

  return {
    name,
    description: description || null,
    frequency: (normalizedDays.length === 7 ? "DAILY" : "CUSTOM") as ApiFrequency,
    daysOfWeek: normalizedDays,
  };
}

function loadAccentColor() {
  try {
    const savedColor = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
    return savedColor && /^#[0-9a-fA-F]{6}$/.test(savedColor)
      ? savedColor
      : DEFAULT_ACCENT_COLOR;
  } catch {
    return DEFAULT_ACCENT_COLOR;
  }
}

function getAccentForeground(color: string) {
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

  return luminance > 0.179 ? "#090909" : "#ffffff";
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
  const [accentColor, setAccentColor] = useState(loadAccentColor);
  const [tasks, setTasks] = useState<Habit[]>([]);
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [focusStartedAt, setFocusStartedAt] = useState<number | null>(null);
  const [elapsedFocusSeconds, setElapsedFocusSeconds] = useState(0);
  const [totalFocusSeconds, setTotalFocusSeconds] = useState(0);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [hoveredFocusDay, setHoveredFocusDay] = useState<string | null>(null);
  const accentForeground = getAccentForeground(accentColor);
  const todayDate = new Date();
  const [todayKey, setTodayKey] = useState(() => getLocalDateKey(todayDate));
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

  async function refreshRemoteData() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [habitsResponse, todayResponse, dashboardResponse] = await Promise.all([
        listHabits(),
        getTodayCheckIns(),
        getDashboard(),
      ]);
      setTodayKey(todayResponse.date);
      setTasks(habitsResponse.items.map((habit) => toLocalHabit(habit, todayResponse.items)));
      setDashboard(dashboardResponse);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível carregar os dados."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshDashboard() {
    try {
      setDashboard(await getDashboard());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível atualizar o painel."
      );
    }
  }

  useEffect(() => {
    void refreshRemoteData();
  }, []);

  useEffect(() => {
    if (activeTab !== "goals" || !selectedGoalHabit) return;

    let isActive = true;
    const [year, month] = monthCalendar.value.split("-").map(Number);
    const monthStart = `${monthCalendar.value}-01`;
    const monthEnd = getLocalDateKey(new Date(year, month, 0));
    const from = monthStart < weekDateKeys[0] ? monthStart : weekDateKeys[0];
    const to = monthEnd > todayKey ? monthEnd : todayKey;

    getHabitCheckIns(selectedGoalHabit.id, from, to)
      .then((checkIns) => {
        if (!isActive) return;

        setTasks((currentTasks) => currentTasks.map((habit) => {
          if (habit.id !== selectedGoalHabit.id) return habit;
          const retainedDates = habit.completionDates.filter(
            (date) => date < from || date > to
          );
          const retainedIds = Object.fromEntries(
            Object.entries(habit.checkInIds).filter(([date]) => date < from || date > to)
          );
          const loadedIds = Object.fromEntries(
            checkIns.map((checkIn) => [checkIn.dateKey, checkIn.id])
          );

          return {
            ...habit,
            completionDates: [...new Set([...retainedDates, ...Object.keys(loadedIds)])],
            checkInIds: { ...retainedIds, ...loadedIds },
          };
        }));
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error ? error.message : "Não foi possível carregar os check-ins."
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeTab, selectedGoalHabit?.id, monthCalendar.value]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isLightMode ? "light" : "dark");
    } catch {
      return;
    }
  }, [isLightMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, accentColor);
    } catch {
      return;
    }
  }, [accentColor]);

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

  async function toggleTask(taskId: string) {
    const task = tasks.find((habit) => habit.id === taskId);
    if (!task) return;

    setErrorMessage(null);
    try {
      if (task.completionDates.includes(todayKey)) {
        const checkInId = task.checkInIds[todayKey];
        if (!checkInId) throw new Error("Não foi possível localizar o check-in para remover.");
        await deleteCheckIn(taskId, checkInId);
        setTasks((currentTasks) => currentTasks.map((habit) => {
          if (habit.id !== taskId) return habit;
          const checkInIds = { ...habit.checkInIds };
          delete checkInIds[todayKey];
          return {
            ...habit,
            checkInIds,
            completionDates: habit.completionDates.filter((date) => date !== todayKey),
          };
        }));
      } else {
        const checkIn = await createCheckIn(taskId);
        setTodayKey(checkIn.dateKey);
        setTasks((currentTasks) => currentTasks.map((habit) =>
          habit.id === taskId
            ? {
              ...habit,
              checkInIds: { ...habit.checkInIds, [checkIn.dateKey]: checkIn.id },
              completionDates: [...new Set([...habit.completionDates, checkIn.dateKey])],
            }
            : habit
        ));
      }
      await refreshDashboard();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível atualizar o check-in."
      );
    }
  }

  function openNewTaskDialog() {
    setEditingTaskId(null);
    setTaskTitle("");
    setTaskDescription("");
    setDaysOfWeek([1]);
    setIsTaskDialogClosing(false);
    setIsTaskDialogOpen(true);
  }

  function openEditTaskDialog(task: Habit) {
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setDaysOfWeek(task.daysOfWeek);
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

  async function handleTaskRowAnimationEnd(event: AnimationEvent<HTMLElement>, taskId: string) {
    if (event.target === event.currentTarget && event.animationName === "task-row-out") {
      try {
        await deleteHabitRequest(taskId);
        setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
        await refreshDashboard();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Não foi possível excluir o hábito."
        );
      } finally {
        setDeletingTaskId(null);
      }
    }
  }

  async function handleSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskTitle.trim();
    const description = taskDescription.trim();

    if (!title || daysOfWeek.length === 0) return;

    setErrorMessage(null);
    setIsSavingTask(true);
    try {
      const input = toApiHabitInput(title, description, daysOfWeek);
      if (editingTaskId) {
        const updatedHabit = await updateHabit(editingTaskId, input);
        setTasks((currentTasks) => currentTasks.map((task) =>
          task.id === editingTaskId
            ? { ...toLocalHabit(updatedHabit), completionDates: task.completionDates, checkInIds: task.checkInIds }
            : task
        ));
      } else {
        const createdHabit = await createHabit(input);
        setTasks((currentTasks) => [...currentTasks, toLocalHabit(createdHabit)]);
      }
      await refreshDashboard();

      setTaskTitle("");
      setTaskDescription("");
      setDaysOfWeek([1]);
      setEditingTaskId(null);
      closeTaskDialog();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível salvar o hábito."
      );
    } finally {
      setIsSavingTask(false);
    }
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
    accentColor,
    setAccentColor,
    accentForeground,
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
    daysOfWeek,
    setDaysOfWeek,
    isSavingTask,
    dashboard,
    isLoading,
    errorMessage,
    clearError: () => setErrorMessage(null),
    refreshRemoteData,
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