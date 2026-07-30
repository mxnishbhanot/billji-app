// Client mirror of backend/src/constants/gstStates.js — only the parts the UI needs:
// listing states for the place-of-supply picker and deciding intra vs inter for the live
// preview. The server re-resolves place of supply on create and its answer is the one
// that gets stored.
export const GST_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' }
];

const BY_CODE = new Map(GST_STATES.map((state) => [state.code, state]));

const normalizeName = (value = '') =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z]/g, '');

const BY_NAME = new Map(GST_STATES.map((state) => [normalizeName(state.name), state]));

export const stateCodeFromGstin = (gstin = '') => {
  const code = gstin.trim().slice(0, 2);
  return BY_CODE.has(code) ? code : '';
};

export const stateCodeFromName = (name = '') => BY_NAME.get(normalizeName(name))?.code || '';

export const stateNameForCode = (code = '') => BY_CODE.get(code.trim())?.name || '';

/** Same precedence as the server: explicit choice, then customer GSTIN, then address. */
export const resolvePlaceOfSupplyCode = ({
  explicitCode,
  customerGstin,
  customerState,
  supplierStateCode
}: {
  explicitCode?: string;
  customerGstin?: string;
  customerState?: string;
  supplierStateCode?: string;
}) =>
  (explicitCode && BY_CODE.has(explicitCode) ? explicitCode : '') ||
  stateCodeFromGstin(customerGstin || '') ||
  stateCodeFromName(customerState || '') ||
  (supplierStateCode && BY_CODE.has(supplierStateCode) ? supplierStateCode : '');

/** Unknown either side means intra-state, matching the server's default. */
export const supplyTypeFor = (supplierStateCode?: string, placeOfSupplyCode?: string): 'intra' | 'inter' => {
  if (!supplierStateCode || !placeOfSupplyCode) return 'intra';
  return supplierStateCode === placeOfSupplyCode ? 'intra' : 'inter';
};
