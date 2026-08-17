/**
 * The link card is pure presentation and owns no navigation: it renders what it is handed
 * and reports the tap. What is worth pinning is that every slot reaches the screen and that
 * pressing it calls the parent's handler rather than routing anywhere itself.
 */
import { PaperProvider } from 'react-native-paper';
import { FileText } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DocumentLinkCard } from '@/features/documents/components/DocumentLinkCard';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));

const renderCard = (props: Partial<React.ComponentProps<typeof DocumentLinkCard>> = {}) => {
  const onPress = jest.fn();
  render(
    <PaperProvider>
      <DocumentLinkCard
        label="INVOICE"
        icon={FileText}
        title="INV-001"
        hint="Record payment, send or share"
        onPress={onPress}
        {...props}
      />
    </PaperProvider>
  );
  return { onPress };
};

describe('DocumentLinkCard', () => {
  it('renders the label, title and hint it is given', () => {
    renderCard();
    expect(screen.getByText('INVOICE')).toBeTruthy();
    expect(screen.getByText('INV-001')).toBeTruthy();
    expect(screen.getByText('Record payment, send or share')).toBeTruthy();
  });

  it('renders the caller-supplied icon', () => {
    const Icon = jest.fn(() => null);
    renderCard({ icon: Icon });
    expect(Icon).toHaveBeenCalled();
  });

  it('falls back to the title for its accessibility label, and uses the supplied one when given', () => {
    renderCard();
    expect(screen.getByLabelText('INV-001')).toBeTruthy();

    screen.unmount();
    renderCard({ accessibilityLabel: 'View invoice INV-001' });
    expect(screen.getByLabelText('View invoice INV-001')).toBeTruthy();
  });

  it('calls the parent handler on press and navigates nowhere itself', () => {
    const { onPress } = renderCard({ accessibilityLabel: 'View invoice INV-001' });
    fireEvent.press(screen.getByLabelText('View invoice INV-001'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
