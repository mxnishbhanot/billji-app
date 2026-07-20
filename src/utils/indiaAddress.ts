/** Indian states / UTs for address pickers (GSTIN-aligned names). */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
] as const;

/** GSTIN first two digits → state (official GST state codes). */
export const GST_STATE_BY_CODE: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh'
};

/** Major cities shown as suggestions once a state is chosen (offline, free). */
export const MAJOR_CITIES_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati', 'Kakinada'],
  Assam: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat'],
  Bihar: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur'],
  Chandigarh: ['Chandigarh'],
  Chhattisgarh: ['Raipur', 'Bhilai', 'Bilaspur', 'Durg'],
  Delhi: ['New Delhi', 'Delhi'],
  Goa: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar'],
  Haryana: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Hisar'],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Solan', 'Mandi'],
  'Jammu and Kashmir': ['Srinagar', 'Jammu', 'Anantnag'],
  Jharkhand: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'],
  Karnataka: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi'],
  Kerala: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'],
  Ladakh: ['Leh', 'Kargil'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad'],
  Odisha: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri'],
  Puducherry: ['Puducherry', 'Karaikal'],
  Punjab: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali'],
  Rajasthan: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'],
  Telangana: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Noida', 'Ghaziabad', 'Varanasi', 'Agra', 'Prayagraj'],
  Uttarakhand: ['Dehradun', 'Haridwar', 'Haldwani', 'Rishikesh'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri']
};

export type PinLookupResult = {
  state: string;
  city: string;
  cities: string[];
};

type PostalOffice = {
  Name?: string;
  District?: string;
  Block?: string;
  State?: string;
};

type PostalApiRow = {
  Status?: string;
  PostOffice?: PostalOffice[] | null;
};

const pinCache = new Map<string, PinLookupResult | null>();

const unique = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

/** Prefer District as "city"; fall back to Block / office Name. */
export function citiesFromOffices(offices: PostalOffice[]): string[] {
  return unique(offices.flatMap((o) => [o.District || '', o.Block || '', o.Name || '']));
}

export function stateFromGstin(gstin: string): string | null {
  const code = gstin.trim().toUpperCase().slice(0, 2);
  return GST_STATE_BY_CODE[code] || null;
}

export function suggestedCitiesForState(state: string, extra: string[] = []): string[] {
  const majors = MAJOR_CITIES_BY_STATE[state] || [];
  return unique([...extra, ...majors]);
}

/** Free India Post PIN lookup (api.postalpincode.in). Cached in-memory. */
export async function lookupPin(pinCode: string): Promise<PinLookupResult | null> {
  const pin = pinCode.trim();
  if (!/^\d{6}$/.test(pin)) return null;
  if (pinCache.has(pin)) return pinCache.get(pin) ?? null;

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    if (!response.ok) {
      pinCache.set(pin, null);
      return null;
    }
    const rows = (await response.json()) as PostalApiRow[];
    const row = rows?.[0];
    const offices = row?.Status === 'Success' ? row.PostOffice || [] : [];
    if (!offices.length) {
      pinCache.set(pin, null);
      return null;
    }

    const state = offices[0].State?.trim() || '';
    const cities = citiesFromOffices(offices);
    const city = offices[0].District?.trim() || cities[0] || '';
    const result: PinLookupResult = { state, city, cities };
    pinCache.set(pin, result);
    return result;
  } catch {
    // Don't cache network failures — retry next time.
    return null;
  }
}
