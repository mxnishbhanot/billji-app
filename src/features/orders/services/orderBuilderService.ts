import { DiscountType, InvoiceItem, OrderCreatePayload } from '@/types';

// Orders reuse the invoice item shape. Unlike invoices, orders never block on
// stock (the backend records zero stock movements for an order), so there is no
// allowOversell flag — availability is only enforced when an invoice is generated.
export const buildOrderPayload = ({
  selectedCustomerId,
  items,
  taxRate,
  discountType,
  discountValue,
  notes
}: {
  selectedCustomerId: string;
  items: InvoiceItem[];
  taxRate: string;
  discountType: DiscountType;
  discountValue: string;
  notes: string;
}): OrderCreatePayload => ({
  customerId: selectedCustomerId,
  items: items.map((item) => ({
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    quantity: Number(item.quantity || 1),
    price: Number(item.price || 0),
    taxRate: item.taxRate,
    isCustom: item.isCustom
  })),
  taxRate: Number(taxRate || 0),
  discountType,
  discountValue: Number(discountValue || 0),
  notes
});
