import type { FinancialSnapshot, FIRECalculations, BlockerType, ActionPlan } from '../types';

export function calculateFIRE(snapshot: FinancialSnapshot): FIRECalculations {
  const mIncome = snapshot.monthlyIncome || 0;
  const mExpenses = snapshot.monthlyExpenses || 0;
  const mSurplus = Math.max(mIncome - mExpenses, 0);

  // Monthly investing must come from explicit user input. Surplus is tracked separately.
  const effMonthlyInvesting = snapshot.monthlyInvesting !== null ? Number(snapshot.monthlyInvesting) : 0;
  
  const targetMSpending = snapshot.targetMonthlySpending !== null ? snapshot.targetMonthlySpending : mExpenses;
  const annualTargetSpending = targetMSpending * 12;
  
  const swr = snapshot.safeWithdrawalRate !== null ? snapshot.safeWithdrawalRate : 0.03;
  const fiNumber = swr > 0 ? annualTargetSpending / swr : 0;
  
  const invested = snapshot.investedAssets || 0;
  const fireProgress = fiNumber > 0 ? invested / fiNumber : 0;
  
  const cashflowFreedom = mExpenses > 0 ? (snapshot.passiveIncome || 0) / mExpenses : 0;
  
  const runwayMonths = mExpenses > 0 ? (snapshot.liquidSavings || 0) / mExpenses : 0;
  
  const savingsRate = mIncome > 0 ? effMonthlyInvesting / mIncome : 0;

  let yearsToFI: number | null = null;
  
  if (invested >= fiNumber && fiNumber > 0) {
    yearsToFI = 0;
  } else if (effMonthlyInvesting > 0 || invested > 0) {
    const annualReturn = snapshot.expectedAnnualRealReturn !== null ? snapshot.expectedAnnualRealReturn : 0.04;
    if (annualReturn <= 0) {
      if (effMonthlyInvesting > 0) {
        const months = Math.max(0, (fiNumber - invested) / effMonthlyInvesting);
        yearsToFI = months / 12;
      }
    } else {
      const monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
      
      let low = 0;
      let high = 80 * 12; // 80 years max search
      let foundMonths = high;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const futureValue = invested * Math.pow(1 + monthlyRate, mid) 
          + effMonthlyInvesting * ((Math.pow(1 + monthlyRate, mid) - 1) / monthlyRate);
          
        if (futureValue >= fiNumber) {
          foundMonths = mid;
          high = mid - 1; // Try to find a smaller month that also satisfies
        } else {
          low = mid + 1;
        }
      }
      yearsToFI = foundMonths / 12;
      if (yearsToFI >= 80) yearsToFI = 80;
    }
  }

  // Calculate potentialYearsToFI
  let potentialYearsToFI: number | null = null;
  const potentialInvested = invested + (snapshot.liquidSavings || 0);
  const potentialInvesting = Math.max(effMonthlyInvesting, mSurplus);
  
  if (potentialInvested >= fiNumber && fiNumber > 0) {
    potentialYearsToFI = 0;
  } else if (potentialInvesting > 0 || potentialInvested > 0) {
    const annualReturn = snapshot.expectedAnnualRealReturn !== null ? snapshot.expectedAnnualRealReturn : 0.04;
    if (annualReturn <= 0) {
      if (potentialInvesting > 0) {
        const months = Math.max(0, (fiNumber - potentialInvested) / potentialInvesting);
        potentialYearsToFI = months / 12;
      }
    } else {
      const monthlyRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
      let low = 0;
      let high = 100 * 12; // 100 years max
      let foundMonths = high;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const futureValue = potentialInvested * Math.pow(1 + monthlyRate, mid) 
          + potentialInvesting * ((Math.pow(1 + monthlyRate, mid) - 1) / monthlyRate);
          
        if (futureValue >= fiNumber) {
          foundMonths = mid;
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      potentialYearsToFI = foundMonths / 12;
    }
  }

  if (potentialYearsToFI !== null && potentialYearsToFI >= 100) {
    potentialYearsToFI = null;
  }

  return {
    monthlySurplus: mSurplus,
    effectiveMonthlyInvesting: effMonthlyInvesting,
    annualTargetSpending,
    fiNumber,
    fireProgress,
    cashflowFreedom,
    runwayMonths,
    savingsRate,
    yearsToFI,
    potentialYearsToFI
  };
}

export function getInsights(snapshot: FinancialSnapshot, calcs: FIRECalculations): ActionPlan {
  let blocker: string = 'scenarioC';
  
  const mIncome = snapshot.monthlyIncome || 0;
  const mExpenses = snapshot.monthlyExpenses || 0;
  const mSurplus = mIncome - mExpenses;
  const isInvesting = calcs.effectiveMonthlyInvesting > 0;
  
  const hasHighDebt = (snapshot.highInterestDebt || 0) > 0 || (snapshot.hasHighInterestDebt === 'yes' && (snapshot.debt || 0) > 0 && (snapshot.highInterestDebt === null || snapshot.highInterestDebt > 0));

  if (mSurplus < 0 && hasHighDebt) {
    blocker = 'financialEmergency';
  } else if (hasHighDebt) {
    blocker = 'highInterestDebt';
  } else if (snapshot.passiveIncome > 0 && snapshot.passiveIncome >= (snapshot.monthlyExpenses || 99999999)) {
    blocker = 'passiveIncomeCovers';
  } else if ((snapshot.investedAssets || 0) >= 100000 && !isInvesting) {
    blocker = 'coastFireMode';
  } else if (mIncome <= 2000) {
    blocker = 'incomeCeiling';
  } else if (mSurplus <= 0) {
    blocker = 'scenarioA';
  } else if (mSurplus > 0 && !isInvesting) {
    blocker = 'scenarioB';
  } else {
    blocker = 'scenarioC';
  }
  
  const runwayTarget = (snapshot.monthlyExpenses || 0) * 3;
  const formatCur = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  const debtAmount = snapshot.highInterestDebt || snapshot.debt || 0;

  switch (blocker) {
    case 'financialEmergency':
      return {
        blocker: '⚡ Financial Emergency Level Red: You are bleeding cash AND drowning in debt.',
        moves: [
          `You have a negative cashflow of ${formatCur(Math.abs(mSurplus))} every month. Stop the bleeding! Cut your expenses below your income TODAY.`,
          `Once your cashflow is positive, attack your ${formatCur(debtAmount)} high-interest debt with everything you have.`,
          `Sell things you don't need to clear this balance faster. Compound interest is destroying your future.`
        ]
      };
    case 'highInterestDebt':
      return {
        blocker: 'The "Bleeding" Fix. High-interest debt is a financial emergency. Compound interest is working against you.',
        moves: [
          `Stop all investing right now (except employer match) and attack this balance.`,
          `Use your monthly surplus to aggressively pay down your ${formatCur(debtAmount)} high-interest debt first.`,
          'Keep a small $1k-$2k emergency buffer, but otherwise, declare war on this debt.'
        ]
      };
    case 'passiveIncomeCovers':
      return {
        blocker: 'You have reached Cashflow Freedom! Your passive income covers your lifestyle.',
        moves: [
          'Verify that your passive income is truly stable and repeatable across market cycles.',
          `Build at least a 3-month cash runway of ${formatCur(runwayTarget)} to protect against income dips.`,
          'Start optimizing for tax efficiency and long-term asset preservation.'
        ]
      };
    case 'coastFireMode':
      return {
        blocker: `Passive Growth. You aren't adding new savings, but your ${formatCur(snapshot.investedAssets || 0)} is generating its own momentum.`,
        moves: [
          'Your assets are doing the heavy lifting. Ensure they are in a low-cost, diversified index fund.',
          `Avoid lifestyle inflation. Keeping your expenses at ${formatCur(mExpenses)} is the key to maintaining your FIRE trajectory.`,
          "Consider small monthly contributions to accelerate your freedom date, even if it's just $100."
        ]
      };
    case 'incomeCeiling':
      return {
        blocker: 'Income Ceiling. You are living lean, but your income is the limiting factor for FIRE.',
        moves: [
          'Focus on income expansion. At this income level, increasing your earnings is 10x more powerful than cutting costs.',
          'Invest in high-ROI skills that can boost your monthly income.',
          'Consider a side-hustle or a career pivot to break the $2,000/mo barrier.'
        ]
      };
    case 'scenarioA':
      return {
        blocker: 'You are living beyond your means (or exactly at them). You have zero investable surplus.',
        moves: [
          'Cut one recurring subscription today.',
          'Negotiate your biggest bills.',
          'Track every dollar for 30 days to find leaks.'
        ]
      };
    case 'scenarioB':
      return {
        blocker: `⚡ Cash Drag. You have a massive surplus of ${formatCur(mSurplus)} every month, but it is sitting idle and losing value to inflation.`,
        moves: [
          'Open a brokerage account today.',
          'Set up an automated monthly transfer of at least 50% of your surplus into an Index Fund.',
          'Build a 3-month emergency fund, then invest the rest.'
        ]
      };
    case 'scenarioC':
    default:
      return {
        blocker: 'Optimize & Accelerate. You are on the right path, but can we reach the finish line faster?',
        moves: [
          'Try to increase your savings rate by 1% this month.',
          'Look for ways to increase your active income.',
          'Review your asset allocation.'
        ]
      };
  }
}
