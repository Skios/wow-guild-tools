import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ICON_STYLES, THEMES, type Prefs } from '../theme';
import { AppearancePicker } from './AppearancePicker';

const show = (prefs: Prefs = { theme: 'midnight', icons: 'game' }) => {
  const onTheme = vi.fn();
  const onIcons = vi.fn();
  render(<AppearancePicker prefs={prefs} onTheme={onTheme} onIcons={onIcons} />);
  return { onTheme, onIcons };
};

describe('AppearancePicker', () => {
  test('offers every theme and icon style with its description', () => {
    show();
    for (const option of [...THEMES, ...ICON_STYLES]) {
      expect(screen.getByRole('radio', { name: new RegExp(option.label) })).toBeInTheDocument();
      expect(screen.getByText(option.description)).toBeInTheDocument();
    }
  });

  test('the current choices are selected', () => {
    show({ theme: 'void', icons: 'line' });
    expect(screen.getByRole('radio', { name: /Void/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Line icons/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Midnight/ })).not.toBeChecked();
  });

  test('picking a theme reports it', async () => {
    const { onTheme, onIcons } = show();
    await userEvent.click(screen.getByRole('radio', { name: /Parchment/ }));
    expect(onTheme).toHaveBeenCalledWith('parchment');
    expect(onIcons).not.toHaveBeenCalled();
  });

  test('picking an icon style reports it', async () => {
    const { onTheme, onIcons } = show();
    await userEvent.click(screen.getByRole('radio', { name: /No icons/ }));
    expect(onIcons).toHaveBeenCalledWith('none');
    expect(onTheme).not.toHaveBeenCalled();
  });

  test('themes and icon styles are separate groups', () => {
    show();
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Icons' })).toBeInTheDocument();
  });
});
