import { fireEvent, render, screen } from '@testing-library/react-native';
import { CaptureChooser } from '../src/components/CaptureChooser';

describe('CaptureChooser', () => {
  it('handles the native Back request without selecting a capture method', async () => {
    const onClose = jest.fn();
    await render(<CaptureChooser visible onClose={onClose} />);
    await fireEvent(screen.getByTestId('capture-modal'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses when tapping backdrop scrim', async () => {
    const onClose = jest.fn();
    await render(<CaptureChooser visible onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('capture-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('enables all three capture options and routes callbacks cleanly', async () => {
    const onClose = jest.fn();
    const onSelectManual = jest.fn();
    const onSelectOcr = jest.fn();
    const onSelectVoice = jest.fn();

    await render(
      <CaptureChooser
        visible
        onClose={onClose}
        onSelectManual={onSelectManual}
        onSelectOcr={onSelectOcr}
        onSelectVoice={onSelectVoice}
      />
    );

    const manualBtn = screen.getByRole('button', { name: 'Nhập thủ công' });
    const ocrBtn = screen.getByRole('button', { name: 'Quét hóa đơn' });
    const voiceBtn = screen.getByRole('button', { name: 'Ghi âm' });

    expect(manualBtn).toBeEnabled();
    expect(ocrBtn).toBeEnabled();
    expect(voiceBtn).toBeEnabled();

    await fireEvent.press(ocrBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectOcr).toHaveBeenCalledTimes(1);

    await fireEvent.press(voiceBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSelectVoice).toHaveBeenCalledTimes(1);

    await fireEvent.press(manualBtn);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSelectManual).toHaveBeenCalledTimes(1);
  });
});
