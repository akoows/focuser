const PRESET_LIMIT = 24;
const COLOR_PATTERN = /^#[\da-f]{6}$/i;

export function habitColorStorageKey(userId) {
  return `focuser:habit-color-presets:${userId}`;
}

export function readHabitColorPresets(userId, storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const presets = JSON.parse(storage.getItem(habitColorStorageKey(userId)) || '[]');
    return Array.isArray(presets)
      ? presets.filter((preset) => typeof preset?.id === 'string'
        && typeof preset?.name === 'string'
        && preset.name.trim().length > 0
        && COLOR_PATTERN.test(preset?.color || '')).slice(0, PRESET_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function writeHabitColorPresets(userId, presets, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.setItem(habitColorStorageKey(userId), JSON.stringify(presets.slice(0, PRESET_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

export function saveHabitColorPreset(presets, color, makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}`) {
  if (!Array.isArray(presets) || typeof color !== 'string' || !COLOR_PATTERN.test(color)) return presets;
  const normalizedColor = color.toUpperCase();
  const existing = presets.find((preset) => preset.color.toUpperCase() === normalizedColor);
  if (existing) return presets;
  if (presets.length >= PRESET_LIMIT) return presets;
  return [...presets, { id: makeId(), name: normalizedColor, color: normalizedColor }];
}

export function deleteHabitColorPreset(presets, presetId) {
  return Array.isArray(presets) ? presets.filter((preset) => preset.id !== presetId) : [];
}
