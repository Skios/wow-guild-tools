import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderWith } from '../test/render';
import { CharacterName } from './CharacterName';
import { RoleIcon } from './RoleIcon';

describe('CharacterName', () => {
  test('is painted in the official class colour', () => {
    renderWith(<CharacterName name="Jaina" classId="MAGE" realm="Silvermoon" />);
    const name = screen.getByText('Jaina');
    expect(name).toHaveStyle({ color: 'rgb(64, 199, 235)' });
    expect(name).toHaveAttribute('title', 'Mage');
    expect(screen.getByText('Silvermoon')).toBeInTheDocument();
  });

  test('a class the server added after this build still renders, in grey', () => {
    renderWith(<CharacterName name="Newbie" classId="NEWCLASS" />);
    expect(screen.getByText('Newbie')).toHaveStyle({ color: 'rgb(156, 163, 175)' });
    expect(screen.getByText('Newbie')).toHaveAttribute('title', 'NEWCLASS');
  });

  test('shows the nickname next to the name, muted', () => {
    renderWith(<CharacterName name="Brannock" classId="WARRIOR" nickname="Matte" />);
    expect(screen.getByText('Brannock')).toBeInTheDocument();
    expect(screen.getByText(/Matte/)).toHaveClass('muted');
    expect(screen.getByText(/Matte/)).toHaveTextContent('· Matte');
  });

  test('no nickname, nothing extra', () => {
    renderWith(<CharacterName name="Brannock" classId="WARRIOR" nickname={null} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  test('realm is optional', () => {
    renderWith(<CharacterName name="Jaina" classId="MAGE" />);
    expect(screen.queryByText('Silvermoon')).not.toBeInTheDocument();
  });
});

describe('RoleIcon', () => {
  test.each([
    ['TANK', 'Tank'],
    ['HEALER', 'Healer'],
    ['DPS', 'Melee DPS'],
    ['RANGED_DPS', 'Ranged DPS'],
  ] as const)('%s is announced as %s', (role, label) => {
    renderWith(<RoleIcon role={role} />);
    expect(screen.getByRole('img', { name: label })).toHaveClass(`role-${role.toLowerCase()}`);
  });

  test('falls back to a built-in label if the server sends none', () => {
    renderWith(<RoleIcon role="TANK" />, undefined, { classes: [], roles: [] });
    expect(screen.getByRole('img', { name: 'Tank' })).toBeInTheDocument();
  });
});
