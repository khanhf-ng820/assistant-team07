import { normalizeHttpError } from '../src/api/errors';

// #56: the API answers boundary violations with a 422 error envelope carrying a stable code.
describe('financial validation error codes', () => {
  it.each([
    ['LARGE_AMOUNT_CONFIRMATION_REQUIRED', 'Số tiền này lớn bất thường. Vui lòng kiểm tra lại và xác nhận nếu đúng.'],
    ['TRANSACTION_DATE_IN_FUTURE', 'Không thể ghi giao dịch cho ngày trong tương lai.'],
    ['LEDGER_LIMIT_EXCEEDED', 'Số tiền vượt quá giới hạn mà ứng dụng hỗ trợ.'],
  ])('maps %s to a Vietnamese message and keeps the code', (code, userMessage) => {
    const error = normalizeHttpError(422, {
      error: { code, message: 'server message', request_id: 'req-1' },
    });
    expect(error.code).toBe(code);
    expect(error.status).toBe(422);
    expect(error.retryable).toBe(false);
    expect(error.requestId).toBe('req-1');
    expect(error.userMessage).toBe(userMessage);
  });
});
