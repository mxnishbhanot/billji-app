import { createEntityWrites, type LocalWriteOptions } from './entityWrites';
import {
  createExpense,
  deleteExpense,
  expenseTotal,
  getExpense,
  getExpenseByServerId,
  updateExpense,
  type ExpenseDoc,
  type ExpenseRecord
} from './expenseRepository';

/**
 * Offline expense writes: the row and its queued push, in one transaction. See entityWrites.
 *
 * One thing is expenses' own: the total. The server derives it from the parts and refuses a
 * client-supplied one, so the device derives it the same way rather than storing a zero and
 * showing an expense list that does not add up. Both sides run `amount + taxAmount`, so the
 * figure entered offline is the figure that survives the sync.
 */

export type ExpenseWriteOptions = LocalWriteOptions;

const writes = createEntityWrites<ExpenseDoc>({
  entity: 'expenses',
  get: getExpense,
  getByServerId: getExpenseByServerId,
  create: createExpense,
  update: updateExpense,
  softDelete: deleteExpense,
  discardReason: 'Expense was deleted before it reached the server'
});

export const findExpenseByAnyId = writes.findByAnyId;
export const deleteExpenseLocally = writes.deleteLocally;

export const createExpenseLocally = (doc: ExpenseDoc, options: ExpenseWriteOptions): Promise<ExpenseRecord> =>
  writes.createLocally({ ...doc, date: doc.date ?? options.now ?? new Date().toISOString(), total: expenseTotal(doc) }, options);

export const updateExpenseLocally = async (
  localId: string,
  patch: Partial<ExpenseDoc>,
  options: ExpenseWriteOptions
): Promise<ExpenseRecord | null> => {
  const touchesTotal = patch.amount !== undefined || patch.taxAmount !== undefined;
  if (!touchesTotal) return writes.updateLocally(localId, patch, options);

  // Recomputed from the merged document: an edit that changes only the tax still has to
  // carry the whole new total, because the queued patch is all the server is sent.
  const existing = await getExpense(localId, options.txn);
  if (!existing) return null;

  return writes.updateLocally(localId, { ...patch, total: expenseTotal({ ...existing.doc, ...patch }) }, options);
};
