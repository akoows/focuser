const DEFAULT_APP_ACCENT_COLOR = '#ffffff';
const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i;

export const APP_ACCENT_PRESETS = [
  { value: '#ffffff', label: 'Branco' },
  { value: '#c4b5fd', label: 'Lavanda' },
  { value: '#93c5fd', label: 'Azul' },
  { value: '#6ee7b7', label: 'Menta' },
  { value: '#f9a8d4', label: 'Rosa' },
  { value: '#fcd34d', label: 'Âmbar' },
];

export function getAccentContrast(color) {
  const value = getAppAccentColor(color).slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#111111' : '#ffffff';
}

export function getAppAccentColor(color) {
  return typeof color === 'string' && HEX_COLOR_PATTERN.test(color)
    ? color
    : DEFAULT_APP_ACCENT_COLOR;
}

export async function saveAppAccentColor(api, color) {
  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error('Use uma cor hexadecimal válida.');
  }
  if (typeof api?.updateProfile !== 'function') {
    throw new TypeError('A atualização do perfil não está disponível.');
  }
  return api.updateProfile({ appAccentColor: color });
}

export async function saveAppColorPresets(api, presets) {
  if (!Array.isArray(presets) || presets.length > 30) {
    throw new TypeError('Os presets de cor precisam ser uma lista com até 30 itens.');
  }
  if (typeof api?.updateProfile !== 'function') {
    throw new TypeError('A atualização do perfil não está disponível.');
  }
  return api.updateProfile({ appColorPresets: presets });
}
