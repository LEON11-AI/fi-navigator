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
  const formatCur = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  switch (blocker) {
    case 'highInterestDebt':
      return {
        blocker: 'The "Bleeding" Fix. High-interest debt is a financial emergency. Compound interest is working against you.',
        moves: [
          `Stop all investing right now (except employer match) and attack this balance.`,
          `Use your monthly surplus to aggressively pay down the highest interest rate first.`,
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
    case 'solidRunwayNoInvesting':
    case 'startingFromZero': {
      const surplus = calcs.effectiveMonthlyInvesting;
      return {
        blocker: `The "Leaky Bucket" Fix. You are making money, but ${formatCur(surplus)} is sitting idle every month being eaten by inflation.`,
        moves: [
          `Set up an auto-transfer of ${formatCur(surplus)} to a broad-market index fund tomorrow morning.`,
          `Ensure your ${formatCur(snapshot.liquidSavings || 0)} runway is in a High-Yield Savings Account.`,
          `Stop trying to time the market. Consistency beats perfection. Start investing now.`
        ]
      };
    }
    case 'thinRunway':
    case 'lowRunway':
      return {
        blocker: 'You are walking a tightrope without a net. Your emergency runway is dangerously thin.',
        moves: [
          `Pause non-essential spending. Your immediate goal is a 3-month runway of ${formatCur(runwayTarget)}.`,
          `Keep this runway completely separate from your long-term investments.`,
          `Once fully funded, immediately redirect that cashflow into investments.`
        ]
      };
    case 'noSurplus':
      return {
        blocker: 'You are living beyond your means (or exactly at them). You are bleeding cash and have zero investable surplus.',
        moves: [
          'Find one recurring subscription or fixed expense and ruthlessly cut it today.',
          'Negotiate your biggest bills: call your car insurance or internet provider right now.',
          'Track every single dollar you spend for the next 30 days. Find the leaks.'
        ]
      };
    case 'highBurnRate':
      return {
        blocker: 'Your lifestyle is too expensive for your income. Your high burn rate is destroying your future freedom.',
        moves: [
          'Pick your top 3 expense categories (housing, food, transport) and reduce one by 10%.',
          'Avoid lifestyle creep. Any future raises must go 100% toward investments.',
          'Consider extreme moves: downsizing housing or selling a financed car.'
        ]
      };
    case 'lowInvestingRate':
      return {
        blocker: `Your savings rate is ${Math.round(calcs.savingsRate * 100)}%. This is too low to build real momentum for early retirement.`,
        moves: [
          `Increase your monthly investing by just 1% of your income this month.`,
          'Automate the transfer right after payday so you never see the money in your checking account.',
          'Run a "Spend less" scenario below to see how a small cut shaves years off your working life.'
        ]
      };
    case 'default':
    default:
      return {
        blocker: 'Your main opportunity is increasing your monthly investing consistency.',
        moves: [
          'Increase monthly investing by 1% of income this month.',
          'Automate the transfer right after payday.',
          'Run one side-income or expense-cut scenario below to compare the impact.'
        ]
      };
  }
}
