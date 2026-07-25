import { Text, TextInput as RNTextInput } from 'react-native';
import { useForm } from 'react-hook-form';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { IndiaAddressFields } from '../IndiaAddressFields';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

function Harness() {
  const { control, setValue, watch } = useForm({ defaultValues: { state: '', pinCode: '', city: '' } });
  return (
    <PaperProvider>
      <IndiaAddressFields control={control} setValue={setValue} />
      <Text testID="state-out">{watch('state')}</Text>
    </PaperProvider>
  );
}

test('picking a state suggestion fills the state field', () => {
  render(<Harness />);
  const stateInput = screen.UNSAFE_getAllByType(RNTextInput)[0];

  fireEvent.changeText(stateInput, 'mah');
  // Android blurs the input on touch-down, before the suggestion press lands.
  fireEvent(stateInput, 'blur');
  fireEvent.press(screen.getByText('Maharashtra'));

  expect(screen.getByTestId('state-out')).toHaveTextContent('Maharashtra');
});

test('focusing another address field closes the state list', () => {
  render(<Harness />);
  const [stateInput, pinInput] = screen.UNSAFE_getAllByType(RNTextInput);

  fireEvent.changeText(stateInput, 'mah');
  expect(screen.getByText('Maharashtra')).toBeTruthy();

  fireEvent(pinInput, 'focus');
  expect(screen.queryByText('Maharashtra')).toBeNull();
});
