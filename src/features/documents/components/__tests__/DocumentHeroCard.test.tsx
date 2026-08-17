/**
 * The hero is pure presentation: it renders exactly what it is handed and owns no document
 * meaning. What is worth pinning is that every slot reaches the screen, and that the optional
 * ones (eyebrow, primary action) stay absent when the caller omits them.
 */
import { Text } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { Clock, ShoppingBag } from 'lucide-react-native';
import { render, screen } from '@testing-library/react-native';
import { DocumentHeroCard } from '@/features/documents/components/DocumentHeroCard';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));

const renderHero = (props: Partial<React.ComponentProps<typeof DocumentHeroCard>> = {}) =>
  render(
    <PaperProvider>
      <DocumentHeroCard
        title="DOC-1"
        subtitle="01 Jan 2026"
        status="draft"
        statusIcon={Clock}
        amountLabel="Order total"
        amount="₹1,000"
        amountMeta="Not yet invoiced"
        {...props}
      />
    </PaperProvider>
  );

describe('DocumentHeroCard', () => {
  it('renders the identity, status, amount and supporting text it is given', () => {
    renderHero();
    expect(screen.getByText('DOC-1')).toBeTruthy();
    expect(screen.getByText('01 Jan 2026')).toBeTruthy();
    expect(screen.getByText('draft')).toBeTruthy();
    expect(screen.getByText('Order total')).toBeTruthy();
    expect(screen.getByText('₹1,000')).toBeTruthy();
    expect(screen.getByText('Not yet invoiced')).toBeTruthy();
  });

  it('omits the eyebrow and the action when the caller supplies neither', () => {
    renderHero();
    expect(screen.queryByText('Sales order')).toBeNull();
    expect(screen.queryByText('Generate invoice')).toBeNull();
  });

  it('renders the eyebrow and the parent-owned primary action when supplied', () => {
    renderHero({ eyebrow: 'Sales order', eyebrowIcon: ShoppingBag, primaryAction: <Text>Generate invoice</Text> });
    expect(screen.getByText('Sales order')).toBeTruthy();
    expect(screen.getByText('Generate invoice')).toBeTruthy();
  });
});
