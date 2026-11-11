import { fireEvent, render, screen } from '@testing-library/react-native';
import { CaptureChooser } from '../src/components/CaptureChooser';

it('handles the native Back request without selecting a capture method', async () => {
  const onClose = jest.fn();
  await render(<CaptureChooser visible onClose={onClose} />);
  await fireEvent(screen.getByTestId('capture-modal'), 'requestClose');
  // Modal's native Back event is unavailable in the JS renderer; test our handler boundary.
  expect(onClose).toHaveBeenCalledTimes(1);
});
