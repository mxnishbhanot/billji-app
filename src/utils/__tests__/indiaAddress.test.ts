import {
  citiesFromOffices,
  stateFromGstin,
  suggestedCitiesForState
} from '../indiaAddress';

describe('indiaAddress', () => {
  it('maps GSTIN state codes', () => {
    expect(stateFromGstin('27AAAAA0000A1Z5')).toBe('Maharashtra');
    expect(stateFromGstin('09')).toBe('Uttar Pradesh');
    expect(stateFromGstin('XX')).toBeNull();
  });

  it('dedupes city suggestions from offices', () => {
    expect(
      citiesFromOffices([
        { District: 'Pune', Block: 'Pune', Name: 'Pune HO' },
        { District: 'Pune', Block: 'Hadapsar', Name: 'Hadapsar SO' }
      ])
    ).toEqual(['Pune', 'Pune HO', 'Hadapsar', 'Hadapsar SO']);
  });

  it('merges major cities with pin extras', () => {
    const cities = suggestedCitiesForState('Karnataka', ['Whitefield']);
    expect(cities[0]).toBe('Whitefield');
    expect(cities).toContain('Bengaluru');
  });
});
