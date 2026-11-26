import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { GreetingHeader } from '../src/components/dashboard/GreetingHeader';
import { LedgerProvider } from '../src/context/LedgerContext';

describe('GreetingHeader', () => {
  it('renders greeting title, subtitle and initial balance in LedgerProvider', async () => {
    await render(
      <LedgerProvider>
        <GreetingHeader userName="Minh" />
      </LedgerProvider>
    );

    expect(screen.getByText('Xin chào, Minh!')).toBeTruthy();
    expect(screen.getByText('Từng bước nhỏ. Thêm tự do.')).toBeTruthy();
    expect(screen.getByText('Tổng số dư ghi nhận')).toBeTruthy();
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.500.000 ₫');
    expect(screen.getByText('Bạn đang chi tiêu rất hợp lý')).toBeTruthy();
  });

  it('toggles balance visibility when eye icon is pressed', async () => {
    await render(
      <LedgerProvider>
        <GreetingHeader userName="Minh" />
      </LedgerProvider>
    );

    const eyeButton = screen.getByTestId('toggle-balance-visibility');

    // Initially visible
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.500.000 ₫');

    // Press to hide
    await fireEvent.press(eyeButton);
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('•••••••• ₫');

    // Press to unhide
    await fireEvent.press(eyeButton);
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.500.000 ₫');
  });

  it('calls onWalletPress when wallet button is tapped', async () => {
    const onWalletPress = jest.fn();

    await render(
      <LedgerProvider>
        <GreetingHeader userName="Minh" onWalletPress={onWalletPress} />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('wallet-button'));
    expect(onWalletPress).toHaveBeenCalledTimes(1);
  });
});
