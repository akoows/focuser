import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowUp, ArrowUpDown, CheckCheck,
  Filter, Plus, Target, X,
} from "lucide-react";
import { focuserApi } from "../../services/focuserApi";
import { activateModalFocus } from '../../utils/modalFocus';
import { transitionUI } from '../../utils/transitionUI';
import { HabitCard, HabitIcon } from "./HabitComponents";
import HabitList from "./HabitList";
import CategoryDrawer from "./CategoryDrawer";
import HabitFormModal from "./HabitFormModal";
import HabitHistoryDrawer from "./HabitHistoryDrawer";
import { HABIT_TIME_OPTIONS } from "./habitConfig";
import {
  deleteHabitColorPreset,
  readHabitColorPresets,
  saveHabitColorPreset,
  writeHabitColorPresets,
} from "./habitColorPresets";
import { buildHabitPayload } from "./habitFormModel";

const LOCAL_TODAY_DATE = new Intl.DateTimeFormat("en-CA").format(new Date());

export default function HabitsPageView({ confirm, userId, accentColor, AppLayout, PageHeader, ApiState }) {
  const [habits, setHabits] = useState([]);
  const [habitOrder, setHabitOrder] = useState([]);
  const [habitErrors, setHabitErrors] = useState(new Map());
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [historyHabit, setHistoryHabit] = useState(null);
  const [filter, setFilter] = useState('active');
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isReorderOpen, setIsReorderOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(null);
  const [exitingHabitIds, setExitingHabitIds] = useState(new Set());
  const [enteringHabitIds, setEnteringHabitIds] = useState(new Set());
  const [tabEnteringHabitIds, setTabEnteringHabitIds] = useState(new Set());
  const categoryFilterButtonRef = useRef(null);
  const firstCategoryOptionRef = useRef(null);
  const reorderButtonRef = useRef(null);
  const firstReorderButtonRef = useRef(null);
  const reorderDialogRef = useRef(null);
  const habitFormTriggerRef = useRef(null);
  const habitFormReturnFocusRef = useRef(null);
  const habitNameInputRef = useRef(null);
  const habitFormDialogRef = useRef(null);
  const historyDrawerFallbackRef = useRef(null);
  const categoryAnimationTimerRef = useRef(null);
  const tabAnimationTimerRef = useRef(null);
  const habitAnimationTimerRef = useRef(null);
  const [habitAnimation, setHabitAnimation] = useState(null);
  const [savedHabitColors, setSavedHabitColors] = useState(() => readHabitColorPresets(userId));
  const [openTimeGroups, setOpenTimeGroups] = useState(() => new Set(HABIT_TIME_OPTIONS.map(({ value }) => value)));
  const [isLoading, setIsLoading] = useState(true);
  const [busyIds, setBusyIds] = useState(new Set());
  const busyId = busyIds.values().next().value || '';
  const busyIdRef = useRef(busyId);
  const setHabitBusy = (id, busy) => setBusyIds((current) => {
    const next = new Set(current);
    if (busy) next.add(id);
    else next.delete(id);
    return next;
  });
  const setHabitError = (id, message) => setHabitErrors((current) => {
    const next = new Map(current);
    if (message) next.set(id, message);
    else next.delete(id);
    return next;
  });
  const [error, setError] = useState('');
  const [orderError, setOrderError] = useState('');
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const savingOrderRef = useRef(false);
  const closeCategoryDrawer = useCallback(() => setIsCategoryFilterOpen(false), []);
  const closeHabitHistory = useCallback(() => setHistoryHabit(null), []);
  const getHistoryDrawerFallback = useCallback(() => historyDrawerFallbackRef.current, []);
  const openHabitHistory = useCallback((habit, trigger) => {
    historyDrawerFallbackRef.current = trigger;
    setHistoryHabit(habit);
  }, []);

  useEffect(() => { busyIdRef.current = busyId; }, [busyId]);

  useEffect(() => {
    try {
      writeHabitColorPresets(userId, savedHabitColors);
    } catch {
      // Presets are still usable in the current session if browser storage is blocked.
    }
  }, [savedHabitColors, userId]);

  const handleSaveHabitColorPreset = (color) => {
    setSavedHabitColors((current) => saveHabitColorPreset(current, color));
  };

  const handleDeleteHabitColorPreset = (presetId) => {
    setSavedHabitColors((current) => deleteHabitColorPreset(current, presetId));
  };

  const readHabitOrder = useCallback((items) => {
    // Order is now persisted on the backend via the position field;
    // the API returns habits sorted by position so we just preserve that order.
    return items.map((habit) => habit.id);
  }, []);

  const loadHabits = async () => {
    setError('');
    try {
      const habitResponse = await focuserApi.habits.list({ status: 'all', limit: '100' });
      setHabitOrder(readHabitOrder(habitResponse.items));
      setHabits(habitResponse.items);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    focuserApi.habits.list({ status: 'all', limit: '100' })
      .then((habitResponse) => {
        if (!active) return;
        setHabitOrder(readHabitOrder(habitResponse.items));
        setHabits(habitResponse.items);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [readHabitOrder]);

  const submitHabit = async (event, formValues) => {
    event.preventDefault();
    const busyKey = editingHabit?.id || 'new';
    if (!formValues.name.trim() || busyIds.has(busyKey)) return;
    setHabitBusy(busyKey, true);
    setError('');
    try {
      const habitData = buildHabitPayload(formValues, Boolean(editingHabit));
      if (editingHabit) await focuserApi.habits.update(editingHabit.id, habitData);
      else await focuserApi.habits.create(habitData);
      if (editingHabit) {
        window.clearTimeout(habitAnimationTimerRef.current);
        setHabitAnimation({ id: editingHabit.id, type: 'editing' });
        habitAnimationTimerRef.current = window.setTimeout(() => setHabitAnimation(null), 650);
      }
      setEditingHabit(null);
      setShowForm(false);
      await loadHabits();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setHabitBusy(busyKey, false);
    }
  };

  const checkIn = async (id, amount = 1, date, mode = 'add') => {
    setHabitBusy(id, true);
    setHabitError(id, '');
    try {
      const result = mode === 'remove'
        ? await focuserApi.habits.removeCheckIn(id, { amount, date })
        : await focuserApi.habits.checkIn(id, { amount, ...(date ? { date } : {}) });
      const habit = habits.find((item) => item.id === id);
      const savedDate = result.checkIn?.dateKey ?? date ?? LOCAL_TODAY_DATE;
      const savedDay = habit?.weeklyProgress?.find((day) => day.date === savedDate);
      const target = result.progress?.target ?? habit?.dailyTarget ?? 1;
      const currentCount = savedDay?.checkInCount ?? (savedDay?.completed ? target : 0);
      const completed = result.progress?.value ?? (typeof result.progress?.completed === 'number' ? result.progress.completed : undefined)
        ?? (mode === 'remove' ? Math.max(0, currentCount - amount) : currentCount + amount);

      setHabits((currentHabits) => currentHabits.map((item) => item.id === id
        ? {
        ...item,
            ...(result.streaks ? { currentStreak: result.streaks.currentStreak, longestStreak: result.streaks.longestStreak } : {}),
            weeklyProgress: item.weeklyProgress?.map((day) => day.date === savedDate
              ? { ...day, checkInCount: completed, dailyTarget: target, completed: completed >= target }
              : day),
          }
        : item));

      return true;
    } catch (requestError) {
      if (requestError.code === 'REQUEST_OUTCOME_UNKNOWN') {
        await loadHabits();
        setHabitError(id, `${requestError.message} Recarreguei os hábitos para conferir o resultado; confira o contador antes de registrar novamente.`);
      } else {
        setHabitError(id, requestError.message);
      }
      return false;
    } finally {
      setHabitBusy(id, false);
    }
  };

  const openCreateForm = () => {
    setError('');
    setEditingHabit(null);
    habitFormReturnFocusRef.current = habitFormTriggerRef.current;
    setShowForm(true);
  };

  const editHabit = (habit, trigger) => {
    setError('');
    setEditingHabit(habit);
    habitFormReturnFocusRef.current = trigger || habitFormTriggerRef.current;
    window.clearTimeout(habitAnimationTimerRef.current);
    setHabitAnimation({ id: habit.id, type: 'editing' });
    habitAnimationTimerRef.current = window.setTimeout(() => setHabitAnimation(null), 650);
    setShowForm(true);
  };

  const closeHabitForm = () => {
    setEditingHabit(null);
    setShowForm(false);
  };

  const archiveHabit = async (habit) => {
    setHabitBusy(habit.id, true);
    setError('');
    window.clearTimeout(habitAnimationTimerRef.current);
    if (habit.isActive) setHabitAnimation({ id: habit.id, type: 'archiving' });
    else setHabitAnimation({ id: habit.id, type: 'reactivating' });
    try {
      if (habit.isActive) {
        await new Promise((resolve) => {
          habitAnimationTimerRef.current = window.setTimeout(resolve, 1000);
        });
      } else {
        await new Promise((resolve) => {
          habitAnimationTimerRef.current = window.setTimeout(resolve, 220);
        });
      }
      await focuserApi.habits.archive(habit.id, habit.isActive);
      await loadHabits();
      setHabitAnimation(null);
    } catch (requestError) {
      setHabitAnimation(null);
      setError(requestError.message);
    } finally {
      setHabitBusy(habit.id, false);
    }
  };

  const deleteHabit = async (habit) => {
    if (!await confirm({
      title: 'Excluir hábito?',
      message: `Excluir "${habit.name}" e todo o histórico de check-ins? Esta ação não pode ser desfeita.`,
    })) return;
    setHabitBusy(habit.id, true);
    setError('');
    window.clearTimeout(habitAnimationTimerRef.current);
    setHabitAnimation({ id: habit.id, type: 'deleting' });
    try {
      await new Promise((resolve) => {
        habitAnimationTimerRef.current = window.setTimeout(resolve, 240);
      });
      await focuserApi.habits.remove(habit.id);
      await loadHabits();
      setHabitAnimation(null);
    } catch (requestError) {
      setHabitAnimation(null);
      setError(requestError.message);
    } finally {
      setHabitBusy(habit.id, false);
    }
  };

  const availableCategories = [...new Set(habits.map((habit) => habit.category?.trim() || 'Sem categoria'))]
    .sort((first, second) => {
      if (first === 'Sem categoria') return 1;
      if (second === 'Sem categoria') return -1;
      return first.localeCompare(second, 'pt-BR');
    });
  const habitOrderIndex = new Map(habitOrder.map((id, index) => [id, index]));
  const orderedHabits = [...habits].sort((first, second) => (habitOrderIndex.get(first.id) ?? Infinity) - (habitOrderIndex.get(second.id) ?? Infinity));
  const statusFilteredHabits = orderedHabits.filter((habit) => filter === 'active' ? habit.isActive : !habit.isActive);
  const categoryMatches = (habit, selection) => !selection || selection.has(habit.category?.trim() || 'Sem categoria');
  const visibleHabits = statusFilteredHabits.filter((habit) => categoryMatches(habit, selectedCategories));
  const renderedHabits = orderedHabits.filter((habit) => (
    (statusFilteredHabits.includes(habit) && categoryMatches(habit, selectedCategories))
    || exitingHabitIds.has(habit.id)
  ));
  const selectedCategoryCount = selectedCategories?.size ?? availableCategories.length;
  const activeHabits = habits.filter((habit) => habit.isActive).length;
  const todayProgressFor = (habit) => habit.weeklyProgress?.find((day) => day.isToday);
  const scheduledTodayHabits = habits.filter((habit) => habit.isActive && todayProgressFor(habit)?.scheduled);
  const completedTodayCount = scheduledTodayHabits.filter((habit) => todayProgressFor(habit)?.completed).length;
  const scheduledTodayCount = scheduledTodayHabits.length;
  const updateCategorySelection = (selection) => {
    const nextSelection = selection && selection.size !== availableCategories.length ? selection : null;
    window.clearTimeout(categoryAnimationTimerRef.current);
    const currentlyRendered = new Set([
      ...statusFilteredHabits.filter((habit) => categoryMatches(habit, selectedCategories)).map((habit) => habit.id),
      ...exitingHabitIds,
    ]);
    const nextVisible = new Set(statusFilteredHabits.filter((habit) => categoryMatches(habit, nextSelection)).map((habit) => habit.id));
    const exiting = new Set([...currentlyRendered].filter((id) => !nextVisible.has(id)));
    const entering = new Set([...nextVisible].filter((id) => !currentlyRendered.has(id)));
    setSelectedCategories(nextSelection);
    setExitingHabitIds(exiting);
    setEnteringHabitIds(entering);
    if (exiting.size || entering.size) {
      categoryAnimationTimerRef.current = window.setTimeout(() => {
        setExitingHabitIds(new Set());
        setEnteringHabitIds(new Set());
      }, 240);
    }
  };
  const changeHabitStatusFilter = (nextFilter) => {
    if (nextFilter === filter) return;
    window.clearTimeout(tabAnimationTimerRef.current);
    const currentlyVisible = statusFilteredHabits
      .filter((habit) => categoryMatches(habit, selectedCategories))
      .map((habit) => habit.id);
    const nextVisible = orderedHabits
      .filter((habit) => nextFilter === 'active' ? habit.isActive : !habit.isActive)
      .filter((habit) => categoryMatches(habit, selectedCategories))
      .map((habit) => habit.id);
    const currentIds = new Set(currentlyVisible);
    const entering = new Set(nextVisible.filter((id) => !currentIds.has(id)));
    setTabEnteringHabitIds(entering);
    setFilter(nextFilter);
    if (entering.size) {
      tabAnimationTimerRef.current = window.setTimeout(() => {
        setTabEnteringHabitIds(new Set());
      }, 240);
    } else {
      setTabEnteringHabitIds(new Set());
    }
  };

  const renderHabitCard = (habit) => (
    <div
      key={habit.id}
      className={`habit-filter-item${exitingHabitIds.has(habit.id) ? ' is-exiting' : ''}${enteringHabitIds.has(habit.id) ? ' is-entering' : ''}${tabEnteringHabitIds.has(habit.id) ? ' is-tab-entering' : ''}${habitAnimation?.id === habit.id ? ` is-${habitAnimation.type}` : ''}`}
    >
      <HabitCard
        habit={habit}
        completedToday={Boolean(todayProgressFor(habit)?.completed)}
        scheduledToday={Boolean(todayProgressFor(habit)?.scheduled)}
        isBusy={busyIds.has(habit.id)}
        error={habitErrors.get(habit.id)}
        onClearError={setHabitError}
        onCheckIn={checkIn}
        onHistory={openHabitHistory}
        onEdit={editHabit}
        onArchive={archiveHabit}
        onDelete={deleteHabit}
      />
    </div>
  );

  useEffect(() => () => {
    window.clearTimeout(categoryAnimationTimerRef.current);
    window.clearTimeout(tabAnimationTimerRef.current);
    window.clearTimeout(habitAnimationTimerRef.current);
  }, []);



  useEffect(() => {
    if (!isReorderOpen) return undefined;
    return activateModalFocus(reorderDialogRef.current, {
      initialFocus: firstReorderButtonRef.current,
      fallbackFocus: () => reorderButtonRef.current,
      onEscape: () => setIsReorderOpen(false),
    });
  }, [isReorderOpen]);

  useEffect(() => {
    if (!showForm) return undefined;
    return activateModalFocus(habitFormDialogRef.current, {
      initialFocus: habitNameInputRef.current,
      fallbackFocus: () => habitFormReturnFocusRef.current,
      onEscape: () => { if (!busyIdRef.current) closeHabitForm(); },
    });
  }, [showForm]);

  const moveHabit = async (index, direction) => {
    if (savingOrderRef.current) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedHabits.length) return;
    const nextOrder = [...orderedHabits];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    const nextIds = nextOrder.map((habit) => habit.id);
    setHabitOrder(nextIds);
    setOrderError('');
    savingOrderRef.current = true;
    setIsSavingOrder(true);
    try {
      await focuserApi.habits.reorder(nextIds);
    } catch (reorderError) {
      setHabitOrder(orderedHabits.map((habit) => habit.id));
      setOrderError(`Não foi possível salvar a ordem dos hábitos: ${reorderError.message}`);
    } finally {
      savingOrderRef.current = false;
      setIsSavingOrder(false);
    }
  };
  const emptyHabitsMessage = selectedCategories && selectedCategories.size !== availableCategories.length
    ? 'Nenhum hábito encontrado que corresponda aos filtros selecionados.'
    : filter === 'active'
      ? 'Nenhum hábito encontrado. Crie um hábito ou consulte os arquivados.'
      : 'Nenhum hábito arquivado.';
  const groupedHabits = HABIT_TIME_OPTIONS.map((group) => ({
    ...group,
    habits: renderedHabits.filter((habit) => (habit.timeOfDay || 'ANYTIME') === group.value),
  })).filter((group) => group.habits.length > 0);
  const toggleTimeGroup = (value) => setOpenTimeGroups((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });

  return (
    <AppLayout>
      <PageHeader title="Hábitos" eyebrow="Sua rotina" subtitle="Pequenos passos, consistência todos os dias." action={<button ref={habitFormTriggerRef} type="button" className="button button-primary" onClick={openCreateForm}><Plus size={16} /> Novo hábito</button>} />
      <section className="habit-overview" aria-label="Resumo dos hábitos">
        <article className="habit-overview-card">
          <span className="habit-overview-icon"><Target size={18} /></span>
          <span><strong>{activeHabits}</strong><small>hábitos ativos</small></span>
        </article>
        <article className="habit-overview-card">
          <span className="habit-overview-icon"><CheckCheck size={18} /></span>
          <span><strong>{completedTodayCount} <small>/ {scheduledTodayCount}</small></strong><small>concluídos hoje</small></span>
        </article>
      </section>
      <div className="filter-row habit-filter-row" role="group" aria-label="Filtrar hábitos">
        <button
          ref={categoryFilterButtonRef}
          type="button"
          className={`filter-chip habit-group-toggle habit-category-filter-trigger ${isCategoryFilterOpen || (selectedCategories && selectedCategories.size !== availableCategories.length) ? 'active' : ''}`}
          aria-label={`Filtrar por categoria, ${selectedCategoryCount} de ${availableCategories.length} selecionadas`}
          title="Filtrar por categoria"
          aria-expanded={isCategoryFilterOpen}
          aria-haspopup="dialog"
          aria-controls="habit-category-filter-dialog"
          onClick={() => setIsCategoryFilterOpen(true)}
        >
          <Filter size={18} aria-hidden="true" />
        </button>
        <div className={`habit-status-switch${filter === 'archived' ? ' is-archived' : ''}`} role="group" aria-label="Status dos hábitos">
          <span className="habit-status-switch-indicator" aria-hidden="true" />
          <button type="button" className={filter === 'active' ? 'active' : ''} aria-pressed={filter === 'active'} onClick={() => transitionUI(() => changeHabitStatusFilter('active'))}>Ativos <span>{activeHabits}</span></button>
          <button type="button" className={filter === 'archived' ? 'active' : ''} aria-pressed={filter === 'archived'} onClick={() => transitionUI(() => changeHabitStatusFilter('archived'))}>Arquivados <span>{habits.length - activeHabits}</span></button>
        </div>
        <button
          ref={reorderButtonRef}
          type="button"
          className={`filter-chip habit-group-toggle habit-reorder-trigger${isReorderOpen ? ' active' : ''}`}
          aria-label="Reordenar hábitos"
          title="Reordenar hábitos"
          aria-expanded={isReorderOpen}
          aria-haspopup="dialog"
          aria-controls="habit-reorder-dialog"
          onClick={() => setIsReorderOpen(true)}
        >
          <ArrowUpDown size={18} aria-hidden="true" />
        </button>
        {isReorderOpen ? createPortal(
          <div
            className="app-dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsReorderOpen(false);
            }}
          >
            <section
              ref={reorderDialogRef}
              className="habit-reorder-modal"
              id="habit-reorder-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="habit-reorder-title"
            >
              <header className="habit-category-filter-heading">
                <div>
                  <p className="eyebrow">ORGANIZAÇÃO</p>
                  <h2 id="habit-reorder-title">Reordenar hábitos</h2>
                </div>
                <button
                  type="button"
                  className="habit-category-filter-close"
                  aria-label="Fechar ordenação"
                  onClick={() => setIsReorderOpen(false)}
                >
                  <X size={18} />
                </button>
              </header>
              {orderedHabits.length ? (
                <ol className="habit-reorder-list">
                  {orderedHabits.map((habit, index) => (
                    <li className="habit-reorder-item" key={habit.id}>
                      <span className={`habit-icon habit-icon-${habit.icon || 'TARGET'}`}><HabitIcon name={habit.icon} size={18} /></span>
                      <span className="habit-reorder-name">{habit.name}</span>
                      <span className={`habit-reorder-status${habit.isActive ? ' is-active' : ''}`}>{habit.isActive ? 'Ativo' : 'Arquivado'}</span>
                      <div className="habit-reorder-actions">
                        <button
                          type="button"
                          aria-label={`Mover ${habit.name} para cima`}
                          title="Mover para cima"
                          disabled={isSavingOrder || index === 0}
                          onClick={() => moveHabit(index, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          ref={index === 0 ? firstReorderButtonRef : undefined}
                          type="button"
                          aria-label={`Mover ${habit.name} para baixo`}
                          title="Mover para baixo"
                          disabled={isSavingOrder || index === orderedHabits.length - 1}
                          onClick={() => moveHabit(index, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="muted-state">Crie um hábito para poder reordenar.</p>}
              <footer className="habit-category-filter-footer">
                <span>{isSavingOrder ? 'Salvando ordem…' : 'A ordem é salva para esta conta.'}</span>
                <button type="button" className="button button-primary" onClick={() => setIsReorderOpen(false)}>Concluir</button>
              </footer>
            </section>
          </div>,
          document.body
        ) : null}
        <CategoryDrawer
          isOpen={isCategoryFilterOpen}
          onClose={closeCategoryDrawer}
          categories={availableCategories}
          selectedCategories={selectedCategories}
          selectedCount={selectedCategoryCount}
          habits={habits}
          triggerRef={categoryFilterButtonRef}
          firstOptionRef={firstCategoryOptionRef}
          onChangeSelection={updateCategorySelection}
        />
      </div>
      {orderError ? <div className="card error-state" role="alert">{orderError}</div> : null}
      {error && !showForm ? <div className="card error-state" role="alert">{error}</div> : null}
      {showForm ? <HabitFormModal
        dialogRef={habitFormDialogRef}
        editingHabit={editingHabit}
        accentColor={accentColor}
        habitNameInputRef={habitNameInputRef}
        isBusy={Boolean(busyId)}
        isSaving={busyIds.has(editingHabit?.id || 'new')}
        error={error}
        savedColorPresets={savedHabitColors}
        onSaveColorPreset={handleSaveHabitColorPreset}
        onDeleteColorPreset={handleDeleteHabitColorPreset}
        onClose={closeHabitForm}
        onSubmit={submitHabit}
      /> : null}
      <ApiState loading={isLoading} error={error}       empty={visibleHabits.length === 0 && exitingHabitIds.size === 0
        ? emptyHabitsMessage
        : null}>
        <HabitList groups={groupedHabits} openGroups={openTimeGroups} onToggleGroup={toggleTimeGroup} renderHabitCard={renderHabitCard} />
      </ApiState>
      {historyHabit ? <HabitHistoryDrawer habit={historyHabit} onClose={closeHabitHistory} fallbackFocus={getHistoryDrawerFallback} onChanged={loadHabits} /> : null}
    </AppLayout>
  );
}
