import { z } from 'zod';
import { isValidGstin } from '@/utils/gstin';

export const loginSchema = z.object({ email: z.email('Enter a valid email'), password: z.string().min(1, 'Password is required') });
export const registerSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(80), email: z.email('Enter a valid email'), password: z.string().min(8, 'Use 8+ characters') });
export const forgotPasswordSchema = z.object({ email: z.email('Enter a valid email') });
export const resetPasswordSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    password: z.string().min(8, 'Use 8+ characters'),
    confirmPassword: z.string().min(1, 'Confirm your password')
  })
  .refine((data) => data.password === data.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
export const customerSchema = z.object({ name: z.string().trim().min(1, 'Customer name is required').max(120), phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'), countryCode: z.string().default('+91'), email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(), address: z.string().max(500).optional() });
const decimalAmount = (label: string) =>
  z.string().trim().min(1, `${label} is required`)
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), `Enter a valid ${label.toLowerCase()}`)
    .refine((v) => Number(v) >= 0, `${label} cannot be negative`);
const wholeNumber = (label: string) =>
  z.string().trim().min(1, `${label} is required`)
    .refine((v) => /^\d+$/.test(v), `${label} must be a whole number`);
export const productSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(120),
  price: decimalAmount('Price'),
  stockQuantity: wholeNumber('Stock'),
  sku: z.string().trim().max(64, 'SKU is too long').optional(),
  category: z.string().trim().max(80, 'Category is too long').optional(),
  unit: z.string().trim().max(24).optional(),
  lowStockThreshold: z.union([z.literal(''), z.string().trim().regex(/^\d+$/, 'Low stock alert must be a whole number')]).optional()
});
export const emailSchema = z.object({ email: z.email('Enter a valid email') });
// Accepts a 6-digit authenticator/email code or a backup code (e.g. "3f9ac-1b7de").
export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(6, 'Enter your verification code') });
export const customItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(120),
  price: decimalAmount('Price'),
  quantity: wholeNumber('Quantity').refine((v) => Number(v) >= 1, 'Quantity must be at least 1'),
  unit: z.string().max(24)
});
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
