import { CompositeNavigationProp, NavigationProp, NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Customer, InvoiceCreatePayload, InvoiceStatus, SalesDocumentKind, TwoFactorMethod } from '@/types';

export type InvoiceSortParam = 'newest' | 'oldest' | 'amount-high' | 'amount-low';
export type ProductSortParam = 'updated' | 'top-sales' | 'name-asc' | 'price-high' | 'price-low' | 'stock-low';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  AcceptInvite: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  TwoFactorChallenge: {
    challengeToken: string;
    method: Exclude<TwoFactorMethod, 'none'>;
    email?: string;
    devCode?: string;
  };
};

export type DashboardStackParamList = {
  DashboardHome: undefined;
  Reports: undefined;
  Payments: undefined;
  PaymentReminders: undefined;
  GstReturns: undefined;
  Expenses: undefined;
  Purchases: undefined;
};

export type InvoiceStackParamList = {
  InvoiceList: {
    fromReports?: boolean;
    from?: string;
    to?: string;
    sort?: InvoiceSortParam;
    status?: InvoiceStatus;
  } | undefined;
  // documentType absent = a tax invoice. Quotations and challans reuse the same builder.
  InvoiceCreate: { documentType?: SalesDocumentKind } | undefined;
  InvoicePreview: { payload: InvoiceCreatePayload };
  InvoiceDetail: { id: string };
  Documents: { documentType?: SalesDocumentKind } | undefined;
  Drafts: undefined;
  OrderList: undefined;
  OrderCreate: undefined;
  OrderDetail: { id: string };
};

export type CatalogStackParamList = {
  Products: {
    highlight?: string;
    fromReports?: boolean;
    from?: string;
    to?: string;
    sort?: ProductSortParam;
  } | undefined;
  Customers: undefined;
  CustomerDetail: { customer: Customer };
};

export type CustomersStackParamList = {
  Customers: undefined;
  CustomerDetail: { customer: Customer };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  BusinessProfile: undefined;
  TaxSettings: undefined;
  InvoiceTemplate: undefined;
  NotificationSettings: undefined;
  ActivityLog: undefined;
  Ledger: undefined;
  DataExport: undefined;
  DataImport: undefined;
  TwoFactorSetup: undefined;
  Team: undefined;
  Roles: undefined;
  RoleEditor: { roleId?: string };
  AcceptInvite: undefined;
};

export type TabParamList = {
  DashboardTab: NavigatorScreenParams<DashboardStackParamList>;
  InvoicesTab: NavigatorScreenParams<InvoiceStackParamList>;
  CatalogTab: NavigatorScreenParams<CatalogStackParamList>;
  CustomersTab: NavigatorScreenParams<CustomersStackParamList>;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList>;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
};

export type AppNavigationParamList = RootStackParamList &
  TabParamList &
  AuthStackParamList &
  DashboardStackParamList &
  InvoiceStackParamList &
  CatalogStackParamList &
  CustomersStackParamList &
  SettingsStackParamList;

export type AppNavigation = NavigationProp<AppNavigationParamList>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;
export type ForgotPasswordScreenProps = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;
export type ResetPasswordScreenProps = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;
export type TwoFactorChallengeScreenProps = NativeStackScreenProps<AuthStackParamList, 'TwoFactorChallenge'>;
export type DashboardNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<DashboardStackParamList, 'DashboardHome'>,
  NavigationProp<TabParamList>
>;
export type ReportsNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<DashboardStackParamList, 'Reports'>,
  NavigationProp<TabParamList>
>;

export type DashboardScreenProps = {
  navigation: DashboardNavigation;
  route: RouteProp<DashboardStackParamList, 'DashboardHome'>;
};
export type ReportsScreenProps = {
  navigation: ReportsNavigation;
  route: RouteProp<DashboardStackParamList, 'Reports'>;
};
export type PaymentsScreenProps = NativeStackScreenProps<DashboardStackParamList, 'Payments'>;
export type ExpensesScreenProps = NativeStackScreenProps<DashboardStackParamList, 'Expenses'>;
export type InvoicesScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'InvoiceList'>;
export type InvoiceBuilderScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'InvoiceCreate'>;
export type InvoicePreviewScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'InvoicePreview'>;
export type InvoiceDetailScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'InvoiceDetail'>;
export type DraftsScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'Drafts'>;
export type DocumentsScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'Documents'>;
export type OrdersScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'OrderList'>;
export type OrderBuilderScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'OrderCreate'>;
export type OrderDetailScreenProps = NativeStackScreenProps<InvoiceStackParamList, 'OrderDetail'>;
export type ProductsScreenProps = NativeStackScreenProps<CatalogStackParamList, 'Products'>;
export type CustomersScreenProps = NativeStackScreenProps<CustomersStackParamList, 'Customers'>;
export type CustomerDetailScreenProps = NativeStackScreenProps<CustomersStackParamList, 'CustomerDetail'>;
export type SettingsScreenProps = NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'>;
export type BusinessProfileScreenProps = NativeStackScreenProps<SettingsStackParamList, 'BusinessProfile'>;
export type TaxSettingsScreenProps = NativeStackScreenProps<SettingsStackParamList, 'TaxSettings'>;
export type InvoiceTemplateScreenProps = NativeStackScreenProps<SettingsStackParamList, 'InvoiceTemplate'>;
export type ActivityLogScreenProps = NativeStackScreenProps<SettingsStackParamList, 'ActivityLog'>;
export type LedgerScreenProps = NativeStackScreenProps<SettingsStackParamList, 'Ledger'>;
export type TwoFactorSetupScreenProps = NativeStackScreenProps<SettingsStackParamList, 'TwoFactorSetup'>;
export type TeamScreenProps = NativeStackScreenProps<SettingsStackParamList, 'Team'>;
export type RolesScreenProps = NativeStackScreenProps<SettingsStackParamList, 'Roles'>;
export type RoleEditorScreenProps = NativeStackScreenProps<SettingsStackParamList, 'RoleEditor'>;
