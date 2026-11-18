import { fireEvent, render, screen } from '@testing-library/react-native';
import { PiggyBankScreen } from '../src/components/PiggyBankScreen';
import { createDemoSnapshot } from '../src/savings/demoData';

const today = '2026-07-12';

async function renderScreen() {
  await render(<PiggyBankScreen initialSnapshot={createDemoSnapshot(today)} today={today} isSampleData />);
}

it('shows the piggy bank progress, three metric cards and the deposit history', async () => {
  await renderScreen();
  expect(screen.getByRole('header', { name: 'Heo tiết kiệm' })).toBeVisible();
  expect(screen.getByText('Dữ liệu mẫu — chưa kết nối máy chủ')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 62 });
  expect(screen.getByText('62%')).toBeVisible();
  expect(screen.getByLabelText('Tiền còn lại (Safe-to-Spend): 1.500.000 ₫')).toBeVisible();
  expect(screen.getByLabelText('Tiền đã chi hôm nay: 45.000 ₫')).toBeVisible();
  expect(screen.getByLabelText('Hạn mức trong ngày: 100.000 ₫')).toBeVisible();
  expect(screen.getByRole('header', { name: 'Lịch sử đút heo' })).toBeVisible();
  expect(screen.getByLabelText('Đút heo +250.000 ₫ ngày 2026-07-11')).toBeVisible();
  expect(screen.getAllByText('Đút heo')).toHaveLength(3);
});

it('opens the goal editor with a read-only balance and the recommended saving', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Đặt/Thay đổi mục tiêu' }));
  expect(screen.getByLabelText('Số tiền thực tế 3.000.000 ₫, chỉ đọc')).toBeVisible();
  expect(screen.queryByDisplayValue('3000000')).toBeNull();
  expect(screen.getByText('25.000 ₫ / ngày')).toBeVisible();
  expect(screen.getByText('750.000 ₫ / tháng (30 ngày) · còn 30 ngày')).toBeVisible();
  expect(screen.getByText('Tính từ các giao dịch đã xác nhận')).toBeVisible();
});

it('recomputes the recommendation from the draft and cancelling keeps the saved goal', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Đặt/Thay đổi mục tiêu' }));
  await fireEvent.changeText(screen.getByLabelText('Số tiền mục tiêu'), '3.050.000');
  expect(screen.getByText('60.000 ₫ / ngày')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Hủy' }));
  expect(screen.queryByTestId('goal-editor')).toBeNull();
  expect(screen.getByText('trên mục tiêu 2.000.000 ₫ · hạn 2026-08-11')).toBeVisible();
});

it('saves only target and deadline, preserving the saved amount', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByLabelText('Con heo đất 62%. Chạm để thay đổi mục tiêu'));
  await fireEvent.changeText(screen.getByLabelText('Số tiền mục tiêu'), '2500000');
  await fireEvent.changeText(screen.getByLabelText('Hạn mục tiêu'), '2026-09-10');
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu mục tiêu' }));
  expect(screen.queryByTestId('goal-editor')).toBeNull();
  expect(screen.getByText('trên mục tiêu 2.500.000 ₫ · hạn 2026-09-10')).toBeVisible();
  expect(screen.getByText('1.250.000 ₫')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 50 });
});

it('blocks saving an invalid target or a past deadline', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Đặt/Thay đổi mục tiêu' }));
  await fireEvent.changeText(screen.getByLabelText('Số tiền mục tiêu'), '0');
  expect(screen.getByText('Nhập số tiền mục tiêu hợp lệ (VND).')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Lưu mục tiêu' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Số tiền mục tiêu'), '2000000');
  await fireEvent.changeText(screen.getByLabelText('Hạn mục tiêu'), '2026-07-11');
  expect(screen.getByText('Hạn mục tiêu không được trước hôm nay.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Lưu mục tiêu' })).toBeDisabled();
});
