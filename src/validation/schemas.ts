import { z } from 'zod';
import { isValidGstin } from '@/utils/gstin';

export const loginSchema = z.object({ email: z.email('Enter a valid email'), password: z.string().min(1, 'Password is required') });
export const registerSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(80), email: z.email('Enter a valid email'), password: z.string().min(8, 'Use 8+ characters') });
export const customerSchema = z.object({ name: z.string().trim().min(1, 'Customer name is required').max(120), phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'), countryCode: z.string().default('+91'), email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(), address: z.string().max(500).optional() });
export const productSchema = z.object({ name: z.string().trim().min(1, 'Product name is required').max(120), price: z.string().min(1, 'Price is required'), stockQuantity: z.string().min(1, 'Stock is required'), sku: z.string().max(64).optional(), category: z.string().max(80).optional(), lowStockThreshold: z.string().optional() });
export const emailSchema = z.object({ email: z.email('Enter a valid email') });
export const customItemSchema = z.object({ name: z.string().trim().min(1, 'Item name is required').max(120), price: z.string().min(1, 'Price is required'), quantity: z.string().min(1, 'Quantity is required') });
export const settingsSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name is required').max(120),
  phone: z.union([z.literal(''), z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits')]).optional(),
  countryCode: z.string().default('+91'),
  gstNumber: z.union([z.literal(''), z.string().trim().refine(isValidGstin, 'Enter a valid 15-character GSTIN')]).optional(),
  panNumber: z.union([z.literal(''), z.string().trim().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i, 'Enter a valid PAN')]).optional(),
  email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
  website: z.union([z.literal(''), z.string().trim().max(180).regex(/^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i, 'Enter a valid website')]).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(80).optional(),
  pinCode: z.union([z.literal(''), z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits')]).optional(),
  state: z.string().max(80).optional(),
  invoicePrefix: z.string().trim().min(1, 'Invoice prefix is required').max(12),
  theme: z.enum(['light', 'dark']),
  logoUrl: z.string().optional()
});
