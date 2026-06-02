import { calculateFIRE, getInsights } from './src/lib/calculator';

const snapshot: any = {
  monthlyIncome: 20000,
  monthlyExpenses: 9585,
  investedAssets: 0,
  liquidSavings: 0,
  debt: 50000,
  highInterestDebt: 0,
  passiveIncome: 0,
  monthlyInvesting: 10415,
};

const calcs = calculateFIRE(snapshot);
const actionPlan = getInsights(snapshot, calcs);

console.log("Blocker:", actionPlan.blocker);
console.log("Calcs runway:", calcs.runwayMonths);
console.log("Calcs effectiveMonthlyInvesting:", calcs.effectiveMonthlyInvesting);
