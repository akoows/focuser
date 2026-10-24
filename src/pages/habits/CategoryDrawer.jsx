import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { activateModalFocus } from '../../utils/modalFocus';

export default function CategoryDrawer({
  isOpen,
  onClose,
  categories,
  selectedCategories,
  selectedCount,
  habits,
  triggerRef,
  firstOptionRef,
  onChangeSelection,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    return activateModalFocus(dialogRef.current, {
      initialFocus: firstOptionRef.current,
      fallbackFocus: () => triggerRef.current,
      onEscape: onClose,
    });
  }, [isOpen, onClose, firstOptionRef, triggerRef]);

  if (!isOpen) return null;
  const toggleCategory = (category) => {
    const current = selectedCategories ?? new Set(categories);
    const next = new Set(current);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    onChangeSelection(next);
  };

  return createPortal(
    <div className="app-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="habit-category-filter-modal" id="habit-category-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="habit-category-filter-title">
        <header className="habit-category-filter-heading">
          <div><p className="eyebrow">FILTROS</p><h2 id="habit-category-filter-title">Categorias</h2></div>
          <button type="button" className="habit-category-filter-close" aria-label="Fechar filtro de categorias" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="habit-category-filter-actions">
          <button type="button" onClick={() => onChangeSelection(null)}>Todas</button>
          <button type="button" onClick={() => onChangeSelection(new Set())}>Limpar</button>
        </div>
        <div className="habit-category-filter-options">
          {categories.map((category, index) => {
            const isSelected = !selectedCategories || selectedCategories.has(category);
            const categoryCount = habits.filter((habit) => (habit.category?.trim() || 'Sem categoria') === category).length;
            return (
              <label className="habit-category-filter-option" key={category}>
                <input ref={index === 0 ? firstOptionRef : undefined} type="checkbox" checked={isSelected} onChange={() => toggleCategory(category)} />
                <span>{category}</span><small>{categoryCount}</small>
              </label>
            );
          })}
          {!categories.length ? <p className="muted-state">Nenhuma categoria disponível.</p> : null}
        </div>
        <footer className="habit-category-filter-footer">
          <span>{selectedCount} de {categories.length} selecionadas</span>
          <button type="button" className="button button-primary" onClick={onClose}>Concluir</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
