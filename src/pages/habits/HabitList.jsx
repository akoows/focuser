import { ChevronDown } from 'lucide-react';

export default function HabitList({ groups, openGroups, onToggleGroup, renderHabitCard }) {
  return (
    <div className="habit-time-groups">
      {groups.map((group) => {
        const isAlwaysOpen = group.value === 'ANYTIME';
        const isOpen = isAlwaysOpen || openGroups.has(group.value);
        const groupId = `habit-time-${group.value.toLowerCase()}`;
        return (
          <section className="habit-time-group" key={group.value}>
            {!isAlwaysOpen ? (
              <button type="button" className="habit-time-group-toggle" aria-expanded={isOpen} aria-controls={groupId} onClick={() => onToggleGroup(group.value)}>
                <span>{group.label}</span><small>{group.habits.length}</small><ChevronDown size={17} aria-hidden="true" />
              </button>
            ) : null}
            <div className={`habit-time-group-content${isOpen ? ' is-open' : ''}`} id={groupId} aria-hidden={!isOpen} inert={!isOpen}>
              <div className="habit-grid">{group.habits.map(renderHabitCard)}</div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
