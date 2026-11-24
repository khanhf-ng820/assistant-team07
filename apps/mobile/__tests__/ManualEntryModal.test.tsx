import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { LedgerProvider } from '../src/context/LedgerContext';

describe('ManualEntryModal', () => {
  it('renders initial amount, budget badge, and inputs matching Figma Page 8 and plan §4', async () => {
    const onClose = jest.fn();

    await render(
      <LedgerProvider>
        <ManualEntryModal visible onClose={onClose} />
      </LedgerProvider>
    );

    expect(screen.getByText('Thêm khoản chi')).toBeTruthy();
    expect(screen.getByText('SỐ TIỀN CHI TIÊU')).toBeTruthy();
    expect(screen.getByTestId('amount-display-value')).toHaveTextContent('45.000');
    // Prior allowance 120,000 - 45,000 = 75,000 ₫ remaining (carenta-implementation-plan §4 line 120)
    expect(screen.getByTestId('remaining-budget-badge')).toHaveTextContent('Còn 75.000 ₫ sau khoản chi này');

    expect(screen.getByTestId('selected-category-name')).toHaveTextContent('Ăn uống');
    expect(screen.getByDisplayValue('Cơm trưa')).toBeTruthy();
  });

  it('updates amount display when typing on virtual numpad', async () => {
    await render(
      <LedgerProvider>
        <ManualEntryModal visible />
      </LedgerProvider>
    );

    // Delete current amount
    for (let i = 0; i < 6; i++) {
      await fireEvent.press(screen.getByTestId('numpad-key-delete'));
    }

    // Type 65000 -> 120,000 - 65,000 = 55,000 ₫ remaining
    await fireEvent.press(screen.getByTestId('numpad-key-6'));
    await fireEvent.press(screen.getByTestId('numpad-key-5'));
    await fireEvent.press(screen.getByTestId('numpad-key-000'));

    expect(screen.getByTestId('amount-display-value')).toHaveTextContent('65.000');
    expect(screen.getByTestId('remaining-budget-badge')).toHaveTextContent('Còn 55.000 ₫ sau khoản chi này');
  });

  it('submits transaction and closes modal when valid', async () => {
    const onClose = jest.fn();

    await render(
      <LedgerProvider>
        <ManualEntryModal visible onClose={onClose} />
      </LedgerProvider>
    );

    await fireEvent.changeText(screen.getByTestId('manual-entry-note-input'), 'Bún bò Huế');
    await fireEvent.press(screen.getByTestId('submit-expense-button'));

    expect(onClose).toHaveBeenCalled();
  });
});
