import type { Expense } from '../types';
import {
  createEntityRepository,
  type EntityCursor,
  type EntityDocument,
  type EntityPage,
  type ListQuery,
  type WriteOptions
} from './entityRepository';
import type { MongoDoc } from './mappers';

/** Expenses, read and written locally. SQLite only — nothing here touches the network. */

export type ExpenseDoc = MongoDoc & Partial<Expense>;
export type ExpenseRecord = EntityDocument<ExpenseDoc>;
export type ExpenseCursor = EntityCursor;
export type ExpensePage = EntityPage<ExpenseDoc>;
export type { WriteOptions };

export type ExpenseListQuery = Omit<ListQuery, 'where'> & { category?: string };

const repository = createEntityRepository<ExpenseDoc>({
  entity: 'expenses',
  label: 'expense',
  searchColumns: ['vendor_name', 'reference'],
  sortColumn: 'date',
  // Newest first: an expense list is a diary, and today's entry is the one being checked.
  sortDirection: 'DESC',
  filterColumns: ['category', 'payment_method', 'date'],
  // No is_active column — an expense is withdrawn by being voided or deleted, not deactivated.
  hasActiveColumn: false
});

export const getExpense = repository.get;
export const getExpenseByServerId = repository.getByServerId;
export const createExpense = repository.create;
export const updateExpense = repository.update;
export const deleteExpense = repository.softDelete;

const withFilters = ({ category, ...query }: ExpenseListQuery): ListQuery => ({
  ...query,
  where: category ? { category } : undefined
});

export const listExpenses = (query: ExpenseListQuery): Promise<ExpensePage> => repository.list(withFilters(query));
export const countExpenses = (query: ExpenseListQuery): Promise<number> => repository.count(withFilters(query));

/**
 * The total as the server derives it: `money(amount + taxAmount)`. The same formula on both
 * sides, so an expense entered offline shows the figure it will still show once it syncs —
 * the server recomputes rather than trusting it, and arrives at the same number.
 */
export const expenseTotal = (doc: Pick<ExpenseDoc, 'amount' | 'taxAmount'>): number => {
  const amount = Number(doc.amount) || 0;
  const tax = Number(doc.taxAmount) || 0;
  return Math.round((amount + tax) * 100) / 100;
};
