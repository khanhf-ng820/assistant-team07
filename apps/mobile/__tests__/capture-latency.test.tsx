import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
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

describe('Quick-capture deep-link to save performance', () => {
  it('completes manual capture deep-link launch and local save within 5 seconds', async () => {
    const start = performance.now();

    const kind = parseCaptureDeepLink('carenta://capture/manual');
    expect(kind).toBe('manual');

    await renderRouter(routes, { initialUrl: capturePath(kind!) });
    expect(screen.getByText('Thêm khoản chi')).toBeVisible();

    await fireEvent.press(screen.getByTestId('submit-expense-button'));

    const elapsedMs = performance.now() - start;

    expect(screen.queryByText('Thêm khoản chi')).toBeNull();
    expect(screen).toHavePathname('/');
    expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
    expect(elapsedMs).toBeLessThan(CAPTURE_LIMIT_MS);
  });
});
