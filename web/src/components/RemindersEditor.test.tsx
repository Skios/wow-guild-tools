import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { RemindersEditor } from './RemindersEditor';

const setup = (value: number[], sent: number[] = [], disabled = false) => {
  const onChange = vi.fn();
  render(<RemindersEditor value={value} sent={sent} onChange={onChange} disabled={disabled} />);
  return onChange;
};

describe('RemindersEditor', () => {
  test('lists the reminders, latest first, and removes one', async () => {
    const onChange = setup([480, 1440]);

    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['1 day before', '8 h before']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove 8 h before' }));
    expect(onChange).toHaveBeenCalledWith([1440]);
  });

  test('adds hours or days', async () => {
    const onChange = setup([1440]);

    await userEvent.type(screen.getByLabelText('Remind'), '3');
    await userEvent.selectOptions(screen.getByLabelText('Unit'), 'hours');
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    expect(onChange).toHaveBeenLastCalledWith([1440, 180]);

    await userEvent.clear(screen.getByLabelText('Remind'));
    await userEvent.type(screen.getByLabelText('Remind'), '2{Enter}'); // Enter adds, never submits the form around it
    expect(onChange).toHaveBeenLastCalledWith([1440, 120]); // the unit stays as picked
  });

  test('explains why a reminder cannot be added', async () => {
    const onChange = setup([1440]);

    await userEvent.type(screen.getByLabelText('Remind'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/already/);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('Enter adds without submitting the form around it', async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const onChange = vi.fn();
    render(<form onSubmit={onSubmit}><RemindersEditor value={[]} onChange={onChange} /></form>);

    await userEvent.type(screen.getByLabelText('Remind'), '1{Enter}');

    expect(onChange).toHaveBeenCalledWith([1440]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('only whole numbers; the message goes away once the value changes', async () => {
    setup([]);
    const amount = screen.getByLabelText('Remind');

    await userEvent.type(amount, '1e3');
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription('Enter a whole number');

    await userEvent.type(amount, '{Backspace}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('after a remove the keyboard stays in the editor', async () => {
    setup([1440, 480]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove 8 h before' }));
    expect(screen.getByLabelText('Remind')).toHaveFocus();
  });

  test('a sent reminder is marked and stays', () => {
    setup([1440, 480], [1440]);

    expect(screen.getByText('1 day before').closest('li')).toHaveTextContent('sent');
    expect(screen.queryByRole('button', { name: 'Remove 1 day before' })).not.toBeInTheDocument();
  });

  test('disabled: nothing can change', () => {
    setup([1440], [], true);
    expect(screen.getByRole('button', { name: 'Remove 1 day before' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add reminder' })).toBeDisabled();
  });
});
