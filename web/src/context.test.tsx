import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useApi, useClassInfo, useMeta, useRoleLabel } from './context';

describe('context hooks outside a provider', () => {
  test('fail loudly instead of returning undefined', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useApi())).toThrow('ApiContext is missing');
    expect(() => renderHook(() => useMeta())).toThrow('MetaContext is missing');
    expect(() => renderHook(() => useClassInfo('MAGE'))).toThrow();
    expect(() => renderHook(() => useRoleLabel('TANK'))).toThrow();
    quiet.mockRestore();
  });
});
