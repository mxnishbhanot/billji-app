import { apiErrorMessage } from '../client';

describe('apiErrorMessage', () => {
  it('prefers backend validation messages from axios errors', () => {
    const message = apiErrorMessage({
      isAxiosError: true,
      message: 'Request failed',
      response: { data: { details: [{ msg: 'Phone is required' }], message: 'Validation failed' } }
    });

    expect(message).toBe('Phone is required');
  });

  it('falls back through backend message, error message, and default', () => {
    expect(apiErrorMessage({ isAxiosError: true, message: 'Network Error', response: { data: { message: 'Server down' } } })).toBe('Server down');
    expect(apiErrorMessage(new Error('Local failure'))).toBe('Local failure');
    expect(apiErrorMessage(null, 'Fallback message')).toBe('Fallback message');
  });
});
