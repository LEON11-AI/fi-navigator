export interface FinancialSnapshot {
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  investedAssets: number | null;
  investedAssetsProvided?: boolean;
  liquidSavings: number;
  liquidSavingsProvided?: boolean;
  debt: number;
  hasHighInterestDebt?: 'yes' | 'no' | 'not_sure';
  highInterestDebt: number | null;
  highInterestDebtProvided?: boolean;
  passiveIncome: number;
  monthlyInvesting: number | null;
  targetMonthlySpending: number | null;
  expectedAnnualRealReturn: number | null;
  safeWithdrawalRate: number | null;
  currency: string;
}

export interface ParseResult extends FinancialSnapshot {
  confidence?: 'high' | 'medium' | 'low';
  missingFields?: string[];
  error?: string;
}

export interface FIRECalculations {
  monthlySurplus: number;
  effectiveMonthlyInvesting: number;
  annualTargetSpending: number;
  fiNumber: number;
  fireProgress: number; // percentage as decimal (0.5 = 50%)
  cashflowFreedom: number; // percentage as decimal
  runwayMonths: number;
  savingsRate: number;
  yearsToFI: number | null;
  potentialYearsToFI: number | null;
}

export type BlockerType = 
  | 'highInterestDebt'
  | 'financialEmergency'
  | 'passiveIncomeCovers'
  | 'coastFireMode'
  | 'solidRunwayNoInvesting'
  | 'thinRunway'
  | 'noSurplus' 
  | 'highBurnRate' 
  | 'lowRunway' 
  | 'lowInvestingRate' 
  | 'startingFromZero'
  | 'scenarioA'
  | 'scenarioB'
  | 'scenarioC'
  | 'incomeCeiling'
  | 'default';

export interface ActionPlan {
  blocker: string;
  moves: string[];
}
