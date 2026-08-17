/**
 * Label printed on a customerless (counter / cash) sale. It is only a label — such a
 * document keeps `customer: null` and no Customer record is ever created for it, which
 * is what keeps anonymous sales out of balances, ledgers and top-customer reports.
 * Must match WALK_IN_CUSTOMER_NAME in the backend's invoiceService.
 */
export const WALK_IN_CUSTOMER_NAME = 'Walk-in customer';
