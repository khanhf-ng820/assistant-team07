import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../app/_layout';
import TabsLayout from '../app/(tabs)/_layout';
import StatsScreen from '../app/(tabs)/index';
import SavingsScreen from '../app/(tabs)/savings';
import CaptureManual from '../app/capture/manual';
import { capturePath, parseCaptureDeepLink } from '../src/capture/routes';

const CAPTURE_LIMIT_MS = 5000;

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StatsScreen,
  '(tabs)/savings': SavingsScreen,
  'capture/manual': CaptureManual,
};

describe('Quick-capture deep-link to save performance and repeat flows', () => {
  it('completes manual capture deep-link launch, updates ledger balance, and supports repeat launches within 5s', async () => {
    const start = performance.now();

    const kind = parseCaptureDeepLink('carenta://capture/manual');
    expect(kind).toBe('manual');

    await renderRouter(routes, { initialUrl: capturePath(kind!) });
    expect(screen.getByText('Thêm khoản chi')).toBeVisible();

    // Save initial 45.000 đ transaction from deep link (4.500.000 -> 4.455.000 đ)
    await fireEvent.press(screen.getByTestId('submit-expense-button'));
    expect(screen.queryByText('Thêm khoản chi')).toBeNull();
    expect(screen).toHavePathname('/');
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.455.000 ₫');

    // Launch carenta://capture/manual a second time in the same session and enter 25.000 đ
    await act(async () => {
      router.push(capturePath('manual'));
    });
    expect(screen.getByText('Thêm khoản chi')).toBeVisible();
    await fireEvent.press(screen.getByTestId('numpad-key-2'));
    await fireEvent.press(screen.getByTestId('numpad-key-5'));
    await fireEvent.press(screen.getByTestId('numpad-key-000'));
    await fireEvent.press(screen.getByTestId('submit-expense-button'));

    const elapsedMs = performance.now() - start;

    expect(screen.queryByText('Thêm khoản chi')).toBeNull();
    expect(screen).toHavePathname('/');
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.430.000 ₫');
    expect(elapsedMs).toBeLessThan(CAPTURE_LIMIT_MS);
  });
});
