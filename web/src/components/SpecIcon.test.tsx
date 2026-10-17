import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ApiContext, MetaContext, PrefsContext } from '../context';
import type { IconStyle } from '../theme';
import { META, fakeApi } from '../test/render';
import { SpecIcon } from './SpecIcon';

const withMeta = META;
const meta = { ...withMeta, classes: withMeta.classes.map(c => (c.id === 'MAGE' ? { ...c, specs: [{ id: 'FIRE', label: 'Fire', role: 'RANGED_DPS' as const }] } : c)) };

const show = (icons: IconStyle, props: Partial<Parameters<typeof SpecIcon>[0]> = {}) =>
  render(
    <ApiContext.Provider value={fakeApi()}>
      <MetaContext.Provider value={meta}>
        <PrefsContext.Provider value={{ theme: 'midnight', icons }}>
          <SpecIcon classId="MAGE" spec="FIRE" role="RANGED_DPS" {...props} />
        </PrefsContext.Provider>
      </MetaContext.Provider>
    </ApiContext.Provider>,
  );

describe('SpecIcon', () => {
  test('game style shows the specialization image, described for screen readers', () => {
    show('game');
    const image = screen.getByRole('img', { name: 'Fire Mage' });
    expect(image).toHaveAttribute('src', '/icons/spec/mage-fire.jpg');
    expect(image).toHaveAttribute('width', '24');
  });

  test('without a spec it falls back to the class icon', () => {
    show('game', { spec: null });
    const image = screen.getByRole('img', { name: 'Mage' });
    expect(image).toHaveAttribute('src', '/icons/class/mage.jpg');
  });

  test('line style draws the role icon instead', () => {
    show('line');
    expect(screen.getByRole('img', { name: 'Ranged DPS' }).tagName.toLowerCase()).toBe('svg');
  });

  test('no icons style renders nothing', () => {
    const { container } = show('none');
    expect(container).toBeEmptyDOMElement();
  });

  test('a missing image file falls back to the role icon instead of a broken picture', () => {
    show('game');

    fireEvent.error(screen.getByRole('img', { name: 'Fire Mage' }));

    expect(screen.queryByRole('img', { name: 'Fire Mage' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ranged DPS' })).toBeInTheDocument();
  });

  test('an unknown class still produces a valid image path', () => {
    show('game', { classId: 'NEWCLASS', spec: 'SOMETHING' });
    expect(screen.getByRole('img')).toHaveAttribute('src', '/icons/spec/newclass-something.jpg');
  });

  test('respects a custom size', () => {
    show('game', { size: 40 });
    expect(screen.getByRole('img')).toHaveAttribute('height', '40');
  });
});
