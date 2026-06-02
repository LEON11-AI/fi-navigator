import { calculateFIRE } from './src/lib/calculator';

const snapshot: any = {
  monthlyIncome: 20000,
  monthlyExpenses: 9585,
  investedAssets: "0",
  liquidSavings: 0,
  debt: 50000,
  highInterestDebt: 0,
  passiveIncome: 0,
  monthlyInvesting: 10415,
};

const calcs = calculateFIRE(snapshot);
console.log("fireProgress:", calcs.fireProgress, "is exactly zero?", calcs.fireProgress === 0);
