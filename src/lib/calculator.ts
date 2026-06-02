import type { FinancialSnapshot, FIRECalculations, BlockerType, ActionPlan } from '../types';

export function calculateFIRE(snapshot: FinancialSnapshot): FIRECalculations {
  const mIncome = snapshot.monthlyIncome || 0;
  const mExpenses = snapshot.monthlyExpenses || 0;
  const mSurplus = Math.max(mIncome - mExpenses, 0);

  // If user provided a specific monthly investing amount, use it. Otherwise derive from surplus.
  const effMonthlyInvesting = snapshot.monthlyInvesting !== null ? Number(snapshot.monthlyInvesting) : mSurplus;
  
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

  return {
    monthlySurplus: mSurplus,
    effectiveMonthlyInvesting: effMonthlyInvesting,
    annualTargetSpending,
    fiNumber,
    fireProgress,
    cashflowFreedom,
    runwayMonths,
    savingsRate,
    yearsToFI
  };
}

export function getInsights(snapshot: FinancialSnapshot, calcs: FIRECalculations): ActionPlan {
  let blocker: BlockerType = 'default';
  
  const hasHighDebt = (snapshot.highInterestDebt || 0) > 0 || (snapshot.hasHighInterestDebt === 'yes' && (snapshot.debt || 0) > 0 && (snapshot.highInterestDebt === null || snapshot.highInterestDebt > 0));

  if (hasHighDebt) {
    blocker = 'highInterestDebt';
  } else if (snapshot.passiveIncome > 0 && snapshot.passiveIncome >= (snapshot.monthlyExpenses || 99999999)) {
    blocker = 'passiveIncomeCovers';
  } else if (calcs.runwayMonths >= 3 && (snapshot.investedAssets || 0) <= 0.01 && snapshot.investedAssetsProvided) {
    blocker = 'solidRunwayNoInvesting';
  } else if (snapshot.investedAssetsProvided && (snapshot.investedAssets || 0) <= 0.01 && calcs.effectiveMonthlyInvesting > 0) {
    blocker = 'startingFromZero';
  } else if ((snapshot.investedAssets || 0) > 0 && calcs.runwayMonths < 3) {
    blocker = 'thinRunway';
  } else if (calcs.effectiveMonthlyInvesting <= 0) {
    blocker = 'noSurplus';
  } else if ((snapshot.monthlyIncome || 0) > 0 && ((snapshot.monthlyExpenses || 0) / (snapshot.monthlyIncome || 1)) >= 0.75) {
    blocker = 'highBurnRate';
  } else if (calcs.runwayMonths < 3) {
    blocker = 'lowRunway';
  } else if (calcs.savingsRate < 0.15) {
    blocker = 'lowInvestingRate';
  }
  
  const runwayTarget = (snapshot.monthlyExpenses || 0) * 3;

  switch (blocker) {
    case 'highInterestDebt':
      return {
        blocker: 'High-interest debt is slowing down your progress.',
        moves: [
          'List your high-interest balances and interest rates.',
          'Use part of your monthly surplus to attack the highest-interest balance first.',
          'Keep a small emergency buffer while avoiding new high-interest debt.'
        ]
      };
    case 'passiveIncomeCovers':
      return {
        blocker: 'Your cashflow already covers your expenses.\nNow protect that freedom with a cash runway and long-term invested assets.',
        moves: [
          'Verify that your passive income is stable and repeatable.',
          `Build at least a 3-month runway: about $${Math.round(runwayTarget).toLocaleString()}.`,
          'Start turning surplus into long-term invested assets.'
        ]
      };
    case 'solidRunwayNoInvesting':
      return {
        blocker: 'Solid runway, but no invested assets yet.\nYour next opportunity is turning monthly surplus into long-term wealth-building assets.',
        moves: [
          'Keep 3-6 months of expenses in liquid savings.',
          'Start moving new monthly surplus into long-term investments.',
          `Keep your $${Math.round(snapshot.liquidSavings || 0).toLocaleString()} runway separate from investment accounts.`
        ]
      };
    case 'startingFromZero': {
      const surplus = calcs.effectiveMonthlyInvesting;
      return {
        blocker: 'Strong income, but no wealth base yet.\nYour first job is to turn monthly surplus into runway and invested assets.',
        moves: [
          `Build your first 3-month runway: about $${Math.round(runwayTarget).toLocaleString()}.`,
          `Put your next $${Math.round(surplus).toLocaleString()} surplus toward runway first.`,
          `Once your runway is funded, set an automatic monthly investing rule.`
        ]
      };
    }
    case 'thinRunway':
      return {
        blocker: 'Your emergency runway is still thin.',
        moves: [
          `Build your first 3-month runway: about $${Math.round(runwayTarget).toLocaleString()}.`,
          `Keep this runway separate from your $${Math.round(snapshot.investedAssets || 0).toLocaleString()} long-term investments.`,
          `Once runway is funded, keep investing your monthly surplus automatically.`
        ]
      };
    case 'noSurplus':
      return {
        blocker: 'You do not have a positive monthly investing rate yet.',
        moves: [
          'Find one recurring expense to reduce this month.',
          'Set a minimum automatic investment amount, even if small.',
          'Track your monthly surplus before making new large purchases.'
        ]
      };
    case 'highBurnRate':
      return {
        blocker: 'Your expenses take up most of your income.',
        moves: [
          'Pick your top 3 expense categories and reduce one by 10%.',
          'Raise your monthly investing target before lifestyle upgrades.',
          'Review housing, transport, and subscriptions first.'
        ]
      };
    case 'lowRunway':
      return {
        blocker: 'Your emergency runway is still thin.',
        moves: [
          'Build at least 3 months of expenses in liquid savings.',
          'Keep this runway separate from long-term investments.',
          'Pause non-essential upgrades until your runway improves.'
        ]
      };
    case 'lowInvestingRate':
      return {
        blocker: 'Your investing rate is too low to build momentum.',
        moves: [
          'Increase monthly investing by 1% of income this month.',
          'Automate the transfer right after payday.',
          'Run one side-income or expense-cut scenario to compare impact.'
        ]
      };
    case 'default':
    default:
      return {
        blocker: 'Your main opportunity is increasing monthly investing consistency.',
        moves: [
          'Increase monthly investing by 1% of income this month.',
          'Automate the transfer right after payday.',
          'Run one side-income or expense-cut scenario to compare impact.'
        ]
      };
  }
}
