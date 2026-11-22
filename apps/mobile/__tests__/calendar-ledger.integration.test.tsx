import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import StatsScreen from '../app/(tabs)/index';
import TabsLayout from '../app/(tabs)/_layout';
import SavingsScreen from '../app/(tabs)/savings';
import RootLayout from '../app/_layout';
import CalendarDetailScreen from '../app/calendar-detail';

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StatsScreen,
  '(tabs)/savings': SavingsScreen,
  'calendar-detail': CalendarDetailScreen,
};

async function openManualEntry() {
  await fireEvent.press(screen.getByRole('button', { name: 'Thêm giao dịch' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Nhập thủ công' }));
}

async function clearDefaultAmount() {
  // The form opens with the five-digit demo amount (45,000 ₫).
  for (let digit = 0; digit < 5; digit += 1) {
    await fireEvent.press(screen.getByTestId('numpad-key-delete'));
  }
  expect(screen.getByTestId('amount-display-value')).toHaveTextContent(/^0$/);
}

it('opens the full calendar, navigates months and shows the selected day ledger', async () => {
  await renderRouter(routes, { initialUrl: '/' });

  await fireEvent.press(screen.getByRole('button', { name: 'Xem lịch chi tiết' }));
  expect(screen.getByText('Lịch chi tiêu tháng')).toBeVisible();
  await fireEvent.press(screen.getByTestId('next-month-button'));
  expect(screen.getByText('Tháng 8 năm 2024')).toBeVisible();

  await fireEvent.press(screen.getByTestId('calendar-cell-2024-08-12'));
  expect(screen.getByText('Chưa có giao dịch nào trong ngày này.')).toBeVisible();
  expect(screen.getByTestId('day-total-amount')).toHaveTextContent('0 ₫');

  await fireEvent.press(screen.getByRole('button', { name: 'Đóng chi tiết ngày' }));
  await fireEvent.press(screen.getByTestId('prev-month-button'));
  expect(screen.getByText('Tháng 7 năm 2024')).toBeVisible();
  await fireEvent.press(screen.getByTestId('calendar-cell-2024-07-10'));
  expect(screen.getByTestId('selected-day-label')).toHaveTextContent('Thứ Tư, 10 tháng 7, 2024');
  expect(screen.getByText('3 khoản chi')).toBeVisible();
  expect(screen.getByTestId('day-total-amount')).toHaveTextContent('290.000 ₫');
  for (const amount of ['65.000 ₫', '45.000 ₫', '180.000 ₫']) {
    expect(screen.getByText(amount)).toBeVisible();
  }
});

it('previews and saves a manual expense on the selected date', async () => {
  await renderRouter(routes, { initialUrl: '/' });

  await fireEvent.press(screen.getByTestId('next-month-button'));
  await fireEvent.press(screen.getByTestId('calendar-cell-2024-08-12'));
  await fireEvent.press(screen.getByRole('button', { name: 'Đóng chi tiết ngày' }));
  await openManualEntry();
  expect(screen.getByText('Còn 75.000 ₫ sau khoản chi này')).toBeVisible();
  await clearDefaultAmount();
  await fireEvent.press(screen.getByTestId('numpad-key-3'));
  await fireEvent.press(screen.getByTestId('numpad-key-7'));
  await fireEvent.press(screen.getByTestId('numpad-key-000'));
  expect(screen.getByText('Còn 83.000 ₫ sau khoản chi này')).toBeVisible();
  await fireEvent.press(screen.getByTestId('category-selector-button'));
  await fireEvent.press(screen.getByTestId('category-option-education'));
  await fireEvent.changeText(screen.getByTestId('manual-entry-note-input'), '  Vở bài tập  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));

  expect(screen.queryByText('Thêm khoản chi')).toBeNull();
  await fireEvent.press(screen.getByTestId('calendar-cell-2024-08-12'));
  expect(screen.getByTestId('selected-day-label')).toHaveTextContent('Thứ Hai, 12 tháng 8, 2024');
  expect(screen.getByText('Vở bài tập')).toBeVisible();
  expect(screen.getByText('Học tập')).toBeVisible();
  expect(screen.getByText('1 khoản chi')).toBeVisible();
  expect(screen.getByTestId('day-total-amount')).toHaveTextContent('37.000 ₫');
});

it('keeps a zero-amount draft open and leaves the day ledger unchanged', async () => {
  await renderRouter(routes, { initialUrl: '/' });

  await openManualEntry();
  await clearDefaultAmount();
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));

  expect(screen.getByText('Vui lòng nhập số tiền lớn hơn 0')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }));
  await fireEvent.press(screen.getByTestId('calendar-cell-2024-07-10'));
  expect(screen.getByText('3 khoản chi')).toBeVisible();
  expect(screen.getByTestId('day-total-amount')).toHaveTextContent('290.000 ₫');
});
