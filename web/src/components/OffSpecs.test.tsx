import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { renderWith } from '../test/render';
import { OffSpecs } from './OffSpecs';

describe('OffSpecs', () => {
  test('shows an icon per off-spec, in order, described by spec and role', () => {
    renderWith(<OffSpecs classId="WARRIOR" offSpecs={['PROTECTION', 'ARMS']} />);
    expect(screen.getByRole('group', { name: 'Off-specs: Protection (Tank), Arms (Melee DPS)' })).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toEqual([]); // icons are decoration, the group says it all
    expect(document.querySelectorAll('.offspec')[0]).toHaveAttribute('title', 'Protection (Tank)');
  });

  test('renders nothing without off-specs', () => {
    const { container } = renderWith(<OffSpecs classId="MAGE" offSpecs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('a spec the server added after this build gets a neutral placeholder', () => {
    renderWith(<OffSpecs classId="MAGE" offSpecs={['NEWSPEC']} />);
    expect(screen.getByRole('group', { name: 'Off-specs: NEWSPEC' })).toHaveTextContent('?');
  });

  test('a class the server added after this build does not crash either', () => {
    renderWith(<OffSpecs classId="NEWCLASS" offSpecs={['X']} />);
    expect(screen.getByRole('group', { name: 'Off-specs: X' })).toBeInTheDocument();
  });
});
