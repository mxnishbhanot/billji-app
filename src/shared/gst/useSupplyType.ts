import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Customer } from '@/types';
import { resolvePlaceOfSupplyCode, stateCodeFromGstin, stateCodeFromName, supplyTypeFor } from './gstStates';

/**
 * Mirror of the server's place-of-supply resolution (backend resolveDocumentSupply), so a
 * live preview shows the same CGST/SGST-vs-IGST split the created document will carry.
 * Shared by the invoice and order builders — an order quotes the tax its invoice charges.
 */
export const useSupplyType = (customer: Customer | null): 'intra' | 'inter' => {
  const businessProfile = useAuthStore((state) => state.user?.businessProfile);
  const gstNumber = businessProfile?.gstNumber;
  const state = businessProfile?.state;
  const stateCode = businessProfile?.stateCode;

  return useMemo(() => {
    const supplierStateCode = stateCode || stateCodeFromGstin(gstNumber || '') || stateCodeFromName(state || '');
    const placeOfSupplyCode = resolvePlaceOfSupplyCode({
      customerGstin: customer?.gstNumber || customer?.taxIdentifiers?.gstNumber,
      customerState: customer?.billingAddress?.state,
      supplierStateCode
    });
    return supplyTypeFor(supplierStateCode, placeOfSupplyCode);
  }, [customer, gstNumber, state, stateCode]);
};
