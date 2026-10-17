import { ICON_STYLES, THEMES, type IconStyle, type Prefs, type ThemeId } from '../theme';

interface Props {
  prefs: Prefs;
  onTheme: (theme: ThemeId) => void;
  onIcons: (icons: IconStyle) => void;
}

function Choices<T extends string>({ name, legend, options, value, onChange }: {
  name: string;
  legend: string;
  options: { id: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map(option => (
        <label key={option.id} className="choice">
          <input type="radio" name={name} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
          <span className={`swatch swatch-${option.id}`} aria-hidden="true" />
          <span>
            <strong>{option.label}</strong>
            <span className="muted choice-hint">{option.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function AppearancePicker({ prefs, onTheme, onIcons }: Props) {
  return (
    <details className="appearance">
      <summary>Appearance</summary>
      <div className="popover">
        <Choices name="theme" legend="Theme" options={THEMES} value={prefs.theme} onChange={onTheme} />
        <Choices name="icons" legend="Icons" options={ICON_STYLES} value={prefs.icons} onChange={onIcons} />
      </div>
    </details>
  );
}
