/**
 * The notice carries no document meaning: the wording, the icon and the colour are all the
 * caller's. Worth pinning is that each of the three reaches the screen unchanged.
 */
import { PaperProvider } from 'react-native-paper';
import { Ban } from 'lucide-react-native';
import { render, screen } from '@testing-library/react-native';
import { DocumentNotice } from '@/features/documents/components/DocumentNotice';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));

const tone = { background: 'rgba(200, 40, 40, 0.12)', foreground: '#C82828' };

const renderNotice = (props: Partial<React.ComponentProps<typeof DocumentNotice>> = {}) =>
  render(
    <PaperProvider>
      <DocumentNotice icon={Ban} tone={tone} text="This invoice is cancelled." {...props} />
    </PaperProvider>
  );

describe('DocumentNotice', () => {
  it('renders the text it is given', () => {
    renderNotice();
    expect(screen.getByText('This invoice is cancelled.')).toBeTruthy();
  });

  it('renders the caller-supplied icon in the caller-supplied tone', () => {
    const Icon = jest.fn(() => null);
    renderNotice({ icon: Icon });
    expect(Icon).toHaveBeenCalledWith(expect.objectContaining({ color: tone.foreground }), undefined);
  });

  it('applies the tone background to the icon chip', () => {
    const { toJSON } = renderNotice();
    expect(JSON.stringify(toJSON())).toContain(tone.background);
  });
});
