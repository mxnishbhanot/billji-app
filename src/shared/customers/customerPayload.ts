import { Customer, CustomerFormValues } from '@/types';

/**
 * The customer form keeps state / city / PIN flat; the API (and the invoice snapshot that
 * decides CGST+SGST vs IGST) reads them from `billingAddress`. Folded in one place so every
 * caller — customers list, invoice builder, order builder, online or offline — writes the
 * same shape. `line1` is re-sent because the server replaces `billingAddress` wholesale.
 */
export const withBillingAddress = <T extends CustomerFormValues | Partial<Customer>>(payload: T) => {
  const { state, city, pinCode, ...rest } = payload as CustomerFormValues;
  if (state === undefined && city === undefined && pinCode === undefined) return payload;
  return {
    ...rest,
    billingAddress: { line1: rest.address || '', city: city || '', state: state || '', pinCode: pinCode || '' }
  };
};
