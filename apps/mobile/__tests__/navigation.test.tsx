import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../app/_layout';
import TabsLayout from '../app/(tabs)/_layout';
import StatsScreen from '../app/(tabs)/index';
import SavingsScreen from '../app/(tabs)/savings';
import CalendarDetailScreen from '../app/calendar-detail';

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StatsScreen,
  '(tabs)/savings': SavingsScreen,
  'calendar-detail': CalendarDetailScreen,
};

it('starts on Stats and switches between exactly two tabs', async () => {
  await renderRouter(routes, { initialUrl: '/' });
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.getByRole('tab', { name: 'Thống kê' })).toBeSelected();
  await fireEvent.press(screen.getByRole('tab', { name: 'Tiết kiệm' }));
  expect(screen.getByRole('tab', { name: 'Tiết kiệm' })).toBeSelected();
  expect(screen.getByRole('header', { name: 'Heo tiết kiệm' })).toBeVisible();
});

it.each(['Thống kê', 'Tiết kiệm'])('opens and closes the same 3-option chooser from %s without changing tabs', async (tab) => {
  await renderRouter(routes, { initialUrl: '/' });
  await fireEvent.press(screen.getByRole('tab', { name: tab }));
  await fireEvent.press(screen.getByRole('button', { name: 'Thêm giao dịch' }));

  // All 3 capture options are enabled in Phase 2 (Issues #45, #51)
  for (const method of ['Nhập thủ công', 'Quét hóa đơn', 'Ghi âm']) {
    expect(screen.getByRole('button', { name: method })).toBeEnabled();
  }

  await fireEvent.press(screen.getByRole('button', { name: 'Đóng lựa chọn' }));
  expect(screen.queryByText('Chọn cách ghi giao dịch')).toBeNull();
  expect(screen.getByRole('tab', { name: tab })).toBeSelected();
});

it('opens ManualEntryModal when selecting Nhập thủ công from Tiết kiệm tab and locks plus button while busy', async () => {
  await renderRouter(routes, { initialUrl: '/savings' });
  expect(screen.getByRole('tab', { name: 'Tiết kiệm' })).toBeSelected();
  await fireEvent.press(screen.getByRole('button', { name: 'Thêm giao dịch' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Nhập thủ công' }));

  // Verifies ManualEntryModal mounted at root layout opens successfully from Tiết kiệm tab
  expect(screen.getByText('Thêm khoản chi')).toBeVisible();
  expect(screen.getByTestId('remaining-budget-badge')).toBeTruthy();

  // Plus button is disabled while manual entry modal is active
  expect(screen.getByRole('button', { name: 'Thêm giao dịch', hidden: true })).toBeDisabled();

  await fireEvent.press(screen.getByTestId('manual-entry-back'));
  expect(screen.queryByText('Thêm khoản chi')).toBeNull();
});

it('navigates from StatsScreen to calendar-detail and returns', async () => {
  await renderRouter(routes, { initialUrl: '/' });
  await fireEvent.press(screen.getByTestId('view-detailed-calendar-button'));
  expect(screen.getByRole('header', { name: 'Lịch chi tiêu tháng' })).toBeVisible();
  expect(screen.getByTestId('monthly-budget-summary-card')).toBeVisible();

  await fireEvent.press(screen.getByTestId('calendar-back-button'));
  expect(screen.getByTestId('greeting-header')).toBeVisible();
});
