import { calculateFIRE, getInsights } from './src/lib/calculator';

// Simulate App.tsx parsing function
function parseInput(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const parsed = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(parsed) ? null : parsed;
}

// Simulate App.tsx validation function
function isMissing(val: number | null): boolean {
  return val === null || isNaN(val);
}

function runTestCase(name: string, income: number, expenses: number, investedInput: any) {
  console.log(`\n--- Test: ${name} ---`);
  
  const parsedInvested = parseInput(investedInput);
  
  if (isMissing(parsedInvested)) {
    console.log("Result: Needed (calculation blocked)");
    return;
  }
  
  const snapshot = {
    monthlyIncome: income,
    monthlyExpenses: expenses,
    investedAssets: parsedInvested as number,
    investedAssetsProvided: parsedInvested !== null,
    liquidSavings: 0,
    debt: 0,
    hasHighInterestDebt: 'no',
    highInterestDebt: 0,
    highInterestDebtProvided: true,
    passiveIncome: 0,
    monthlyInvesting: income - expenses,
  };
  
  const calcs = calculateFIRE(snapshot as any);
  const insights = getInsights(snapshot as any, calcs);
  
  console.log(`Parsed Invested: ${parsedInvested}`);
  if (parsedInvested === 0) {
    console.log('Result: Continuing, show starting line text');
  } else {
    console.log('Result: Continuing');
  }
  
  console.log(`Blocker text starting with: ${insights.blocker.split('\n')[0]}`);
  console.log(`FIRE Progress: ${calcs.fireProgress}`);
}

// 1. Invested assets 留空 
runTestCase("Invested assets 留空", 20000, 9585, null);
runTestCase("Invested assets empty string", 20000, 9585, "");

// 2. 输入 0
runTestCase("输入 0", 20000, 9585, 0);

// 3. 输入 "0" 字符串
runTestCase("输入 '0'", 20000, 9585, "0");

// 4. 输入 $0
runTestCase("输入 '$0'", 20000, 9585, "$0");

// 5. 输入 0.00
runTestCase("输入 '0.00'", 20000, 9585, "0.00");

// 6. 输入 $1
runTestCase("输入 '$1'", 20000, 9585, "$1");

// 7. 高收入 + 0 投资 + 结余
runTestCase("高收入 + 0投资 + 正结余", 20000, 5000, 0);
