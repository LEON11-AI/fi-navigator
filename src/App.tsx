import { useState, FormEvent, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ArrowRight, ArrowLeft, TrendingUp, ShieldCheck, Zap, Mail, Edit3, X, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';

import type { FinancialSnapshot, ParseResult, FIRECalculations, ActionPlan } from './types';
import { calculateFIRE, getInsights } from './lib/calculator';
import { cn } from './lib/utils';

type ScenarioType = 'invest' | 'spend' | 'earn';

// Defaults based on spec
const defaultSnapshot: FinancialSnapshot = {
  monthlyIncome: null,
  monthlyExpenses: null,
  investedAssets: null,
  liquidSavings: 0,
  debt: 0,
  highInterestDebt: 0,
  passiveIncome: 0,
  monthlyInvesting: null,
  targetMonthlySpending: null,
  expectedAnnualRealReturn: 0.04,
  safeWithdrawalRate: 0.03,
  currency: 'USD'
};

const defaultScenarioAdjustments: Record<ScenarioType, number> = {
  invest: 500,
  spend: 300,
  earn: 1000
};

const hasValue = (value: unknown) => value !== null && value !== undefined && value !== '';
const monthlyInvestingCuePattern = /\b(invest|investing|contribute|contributing|contribution|save|saving|set aside|put aside|deposit|dca)\b|定投|每月投|每月存|储蓄/i;
const monthlyCadencePattern = /\b(monthly|per month|every month|\/mo|\/month|mo\b)\b|每月/i;
const hasExplicitMonthlyInvesting = (text: string) =>
  monthlyInvestingCuePattern.test(text) && monthlyCadencePattern.test(text);
const safeWithdrawalCuePattern = /\b(safe withdrawal|withdrawal rate|swr|4% rule|3% rule)\b|安全提取率|提取率/i;
const returnCuePattern = /\b(real return|annual return|expected return|return assumption|growth rate|roi)\b|实际回报率|年化回报|收益率/i;
const targetSpendingCuePattern = /\b(target spending|fi spending|retirement spending|spend in retirement|want to spend|after retirement|after fi)\b|退休后支出|目标支出|财务自由后支出/i;
const hasExplicitSafeWithdrawalRate = (text: string) => safeWithdrawalCuePattern.test(text);
const hasExplicitExpectedReturn = (text: string) => returnCuePattern.test(text);
const hasExplicitTargetSpending = (text: string) => targetSpendingCuePattern.test(text);

const getCriticalMissingFields = (snapshot: FinancialSnapshot) => {
  const missing = [];
  if (snapshot.monthlyExpenses === null || Number.isNaN(Number(snapshot.monthlyExpenses))) missing.push('monthlyExpenses');
  if (snapshot.investedAssets === null || Number.isNaN(Number(snapshot.investedAssets))) missing.push('investedAssets');
  return missing;
};

const formatCurrency = (val: number | null, _currency = 'USD') => {
  if (val === null || isNaN(val)) return '-';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  } catch {
    return '$' + new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0
    }).format(val);
  }
};

const formatYears = (years: number | null) => {
  if (years === null) return '∞ (Rat Race)';
  if (years >= 100) return '∞ (Rat Race)';
  if (years >= 80) return '80+ years';
  if (years === 0) return 'Already there';
  return `${years.toFixed(1)} years`;
};

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  
  const [missingFields, setMissingFields] = useState<string[]>([]);
  
  const [results, setResults] = useState<{ calcs: FIRECalculations, actionPlan: ActionPlan } | null>(null);
  const [baselineResults, setBaselineResults] = useState<{ calcs: FIRECalculations, actionPlan: ActionPlan } | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioType | null>(null);
  const [scenarioAdjustments, setScenarioAdjustments] = useState(defaultScenarioAdjustments);
  
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [intentType, setIntentType] = useState<'free' | 'paid'>('free');

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('fire_mvp_snapshot');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Fix potential legacy nulls or zero values from previous buggy versions
        if (!parsed.expectedAnnualRealReturn) {
            parsed.expectedAnnualRealReturn = defaultSnapshot.expectedAnnualRealReturn;
        }
        if (!parsed.safeWithdrawalRate) {
            parsed.safeWithdrawalRate = defaultSnapshot.safeWithdrawalRate;
        }
        if (!parsed.targetMonthlySpending) {
            parsed.targetMonthlySpending = defaultSnapshot.targetMonthlySpending;
        }
        if (parsed.monthlyInvestingProvided !== true || !hasValue(parsed.monthlyInvesting) || Number(parsed.monthlyInvesting) <= 0) {
            parsed.monthlyInvesting = null;
            parsed.monthlyInvestingProvided = false;
        }
        
        setSnapshot({ ...defaultSnapshot, ...parsed });
      } catch (e) {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (snapshot) {
      localStorage.setItem('fire_mvp_snapshot', JSON.stringify(snapshot));
    }
  }, [snapshot]);

  const startManualEntry = () => {
    const manualSnapshot = { ...defaultSnapshot };
    setSnapshot(manualSnapshot);
    setMissingFields(['monthlyIncome', 'monthlyExpenses', 'investedAssets']);
    setParseError(null);
    setResults(null);
    localStorage.setItem('fire_mvp_snapshot', JSON.stringify(manualSnapshot));
  };

  const openEmailModal = (intent: 'free' | 'paid') => {
    setIntentType(intent);
    setEmailError(null);
    setEmailSuccess(false);
    setEmailOpen(true);
  };

  const handleParse = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setIsParsing(true);
    setParseError(null);
    setResults(null); 
    
    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText })
      });
      
      const data: ParseResult = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Parsing failed');
      }

      const parsedMonthlyInvestingIsExplicit =
        hasExplicitMonthlyInvesting(inputText) &&
        hasValue(data.monthlyInvesting) &&
        Number(data.monthlyInvesting) > 0;
      const parsedExpectedReturnIsExplicit =
        hasExplicitExpectedReturn(inputText) &&
        hasValue(data.expectedAnnualRealReturn) &&
        Number(data.expectedAnnualRealReturn) > 0;
      const parsedSafeWithdrawalIsExplicit =
        hasExplicitSafeWithdrawalRate(inputText) &&
        hasValue(data.safeWithdrawalRate) &&
        Number(data.safeWithdrawalRate) > 0;
      const parsedTargetSpendingIsExplicit =
        hasExplicitTargetSpending(inputText) &&
        hasValue(data.targetMonthlySpending) &&
        Number(data.targetMonthlySpending) > 0;

      // Clean up AI output for assumption fields
      if (!parsedExpectedReturnIsExplicit) delete data.expectedAnnualRealReturn;
      if (!parsedSafeWithdrawalIsExplicit) delete data.safeWithdrawalRate;
      if (!parsedTargetSpendingIsExplicit) delete data.targetMonthlySpending;
      // Only keep monthly investing if the user explicitly described it.
      if (!parsedMonthlyInvestingIsExplicit) delete data.monthlyInvesting;

      // Merge with defaults
      const newSnapshot: FinancialSnapshot = {
        ...defaultSnapshot,
        ...data,
        investedAssetsProvided: hasValue(data.investedAssets),
        liquidSavingsProvided: hasValue(data.liquidSavings),
        highInterestDebtProvided: hasValue(data.highInterestDebt),
        monthlyInvestingProvided: parsedMonthlyInvestingIsExplicit,
      };

      setSnapshot(newSnapshot);
      localStorage.setItem('fire_mvp_snapshot', JSON.stringify(newSnapshot));
      setMissingFields(data.missingFields || []);
      
    } catch (err) {
       console.error("Parse error:", err);
       setParseError("The smart input could not build a reliable snapshot. Try the example or enter the numbers manually.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleCalculate = () => {
    if (!snapshot) return;
    
    // Check missing critical fields before calculating
    const missing = getCriticalMissingFields(snapshot);

    if (missing.length > 0) {
      setMissingFields(missing);
      return;
    }

    const calcs = calculateFIRE(snapshot);
    const actionPlan = getInsights(snapshot, calcs);
    
    setResults({ calcs, actionPlan });
    setBaselineResults({ calcs, actionPlan });
    setActiveScenario(null);
    setMissingFields([]);
    
    // Trigger confetti if good progress
    if (calcs.fireProgress > 0) {
      setTimeout(() => {
        confetti({
           particleCount: 100,
           spread: 70,
           origin: { y: 0.6 }
        });
      }, 300);
    }
  };

  const handleScenario = (type: ScenarioType) => {
    setActiveScenario(prev => prev === type ? null : type);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans selection:bg-emerald-500/30 selection:text-white">
      
      {/* Navbar Minimal */}
      <nav className="p-6 max-w-5xl mx-auto flex justify-between items-center">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" 
          onClick={() => { setSnapshot(null); setResults(null); setParseError(null); }}
        >
          <h1 className="text-xl font-semibold tracking-tight">FI Navigator</h1>
        </div>
        <div className="flex items-center gap-4">
          {(snapshot || results) && (
            <button 
              onClick={() => { setSnapshot(null); setResults(null); setBaselineResults(null); setInputText(''); setParseError(null); setMissingFields([]); localStorage.removeItem('fire_mvp_snapshot'); }}
              className="text-xs font-semibold text-[var(--text-muted)] hover:text-white transition-colors"
            >
              Start Over
            </button>
          )}
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest border border-[var(--border)] px-3 py-1 rounded-full hidden sm:block">
            Private Beta
          </div>
        </div>
      </nav>

      <main className={cn("mx-auto px-6 pb-12 sm:pb-24 space-y-12", (!results && !snapshot) ? "max-w-5xl" : "max-w-4xl")}>
        {/* HERO & INPUT */}
        {!results && !snapshot && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center pt-12 sm:pt-16 pb-4 sm:pb-12">
            <div className="space-y-6">
               <header className="space-y-4">
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="inline-flex items-center gap-2 text-xs text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-3 py-1.5 rounded-full mb-2"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    No bank connection. No spreadsheet.
                  </motion.div>
                  <motion.h1 
                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight"
                  >
                    Know Your FIRE Number in 60 Seconds.
                  </motion.h1>
                  <motion.p 
                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="text-base sm:text-lg text-[var(--text-muted)] leading-relaxed"
                  >
                    See your financial freedom progress, timeline, and next best money move.
                  </motion.p>
               </header>
               
               <motion.section 
                 layout="position"
                 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                 className="space-y-3"
               >
                 <label className="flex flex-col sm:flex-row sm:items-center justify-between px-1 gap-2">
                   <div className="text-xs font-semibold tracking-widest uppercase text-[var(--text-muted)] flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse"></div>
                     Tell us your rough numbers
                   </div>
                   <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                     <Zap className="w-3 h-3 text-[var(--accent)]" /> Smart input
                   </div>
                 </label>
                 <form onSubmit={handleParse} className="space-y-3">
                   <textarea
                     value={inputText}
                     onChange={e => setInputText(e.target.value)}
                     placeholder="e.g., I earn $8k/month, spend $4.5k, have $120k invested, $20k cash..."
                     className="w-full h-32 p-4 text-base bg-transparent border border-[var(--border)] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] text-white placeholder-[var(--text-muted)] opacity-60 focus:opacity-100 leading-relaxed transition-all appearance-none"
                   />
                   <div className="flex justify-center items-center gap-3">
                     {isParsing && <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />}
                     <button 
                       type="submit" 
                       disabled={isParsing || !inputText.trim()}
                       className="bg-[var(--accent)] text-black px-8 py-3 rounded-lg font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-base shadow-sm w-full sm:w-auto"
                     >
                       {isParsing ? 'Calculating...' : 'Show My FIRE Path'} <ArrowRight className="w-5 h-5" />
                     </button>
                   </div>
                 </form>
                 
                 {parseError && (
                   <div className="text-red-400 text-sm animate-in fade-in slide-in-from-top-2 flex flex-col sm:flex-row sm:items-center gap-2">
                     <span>{parseError}</span>
                     <div className="flex gap-3">
                       <button type="button" onClick={() => setInputText("I earn $5000/month, spend $3000, have $50k invested, and $10k in debt.")} className="underline hover:no-underline">Use example</button>
                       <button type="button" onClick={startManualEntry} className="underline hover:no-underline">Enter manually</button>
                     </div>
                   </div>
                 )}
                 <div className="flex flex-col gap-1 px-1">
                   <p className="text-[var(--text-muted)] text-[11px] opacity-80 mt-1 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Enter rough numbers. You'll confirm everything before we calculate.</p>
                   <p className="text-[var(--text-muted)] text-[11px] opacity-80 pt-0.5">See your FIRE number, timeline, and next best move instantly. No signup required.</p>
                   <p className="text-[var(--text-muted)] text-[11px] opacity-80 pt-0.5">Smart input securely extracts your numbers. The confirmed snapshot is saved only in this browser until you start over.</p>
                 </div>
               </motion.section>
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
              className="block relative mt-4 lg:mt-0"
            >
              {/* Fade gradients for the preview */}
              <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-[var(--bg)] to-transparent z-10 pointer-events-none"></div>
              <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/80 to-transparent z-10 pointer-events-none"></div>
              <div className="absolute left-0 inset-y-0 w-8 bg-gradient-to-r from-[var(--bg)] to-transparent z-10 pointer-events-none"></div>
              <div className="absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-[var(--bg)] to-transparent z-10 pointer-events-none"></div>
              
              <div className="glass p-6 sm:p-8 flex flex-col gap-5 opacity-80 pointer-events-none select-none relative overflow-hidden border border-white/5 shadow-lg">
                <div className="flex justify-between items-end border-b border-[var(--border)] pb-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1 font-semibold">Estimated FIRE Number</div>
                    <div className="text-3xl font-bold tracking-tight text-white">$1,200,000</div>
                  </div>
                  <div className="text-right">
                     <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-1 font-semibold">Time to FI</div>
                     <div className="text-xl font-bold tracking-tight text-[var(--accent)]">14 Years</div>
                  </div>
                </div>

                <div className="bg-transparent rounded-lg p-3 border border-[var(--border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                   <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-0.5">Current Stage</span>
                      <span className="text-xs font-semibold text-white">Foundation Builder</span>
                      <span className="text-[9px] text-[var(--text-muted)] mt-0.5 hidden sm:block">Building base runway and investing rhythm.</span>
                   </div>
                   <div className="sm:text-right flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-0.5">Next Milestone</span>
                      <span className="text-xs font-semibold text-white">25% FIRE Progress</span>
                   </div>
                </div>
                
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium"><span className="text-[var(--text-muted)]">FIRE Progress</span><span className="text-white">23%</span></div>
                    <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden"><div className="h-full bg-[var(--accent)] w-[23%]"></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium"><span className="text-[var(--text-muted)]">Cashflow Freedom</span><span className="text-white">12%</span></div>
                    <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden"><div className="h-full bg-sky-500 w-[12%]"></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5 font-medium"><span className="text-[var(--text-muted)]">Runway</span><span className="text-white">6 months</span></div>
                    <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden"><div className="h-full bg-orange-500 w-[100%]"></div></div>
                  </div>
                </div>

                <div className="bg-transparent p-4 rounded-xl border border-[var(--border)] mt-0">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3 font-semibold">Next Money Move</div>
                  <div className="text-sm font-medium text-white flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-black flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <span className="truncate">Invest $500 more/month</span>
                  </div>
                  <div className="mt-3 text-[10px] flex items-center gap-1.5 font-medium text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-1.5 rounded">
                    <Zap className="w-3.5 h-3.5" /> Reward: 4.8 years earlier if you do this
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* SNAPSHOT EDIT & CONFIRM */}
        <AnimatePresence mode="popLayout">
          {snapshot && !results && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass p-6 sm:p-8 space-y-8"
            >
              <div className="border-b border-[var(--border)] pb-4">
                <h3 className="text-2xl font-bold tracking-tight text-white">Financial Snapshot</h3>
                <p className="text-[var(--text-muted)] mt-1">Tap any number to edit before we calculate. Your confirmed snapshot stays in this browser unless you clear it.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-4">
                <SnapshotField 
                  label="Monthly Income" 
                  val={snapshot.monthlyIncome} 
                  fieldKey="monthlyIncome" 
                   
                  setSnapshot={setSnapshot}
                  microcopy="Your take-home pay after taxes."
                  pitfall="Don't use pre-tax income, or your cashflow will be artificially high."
                />
                <SnapshotField 
                  label="Monthly Expenses" 
                  val={snapshot.monthlyExpenses} 
                  fieldKey="monthlyExpenses" 
                   
                  setSnapshot={setSnapshot} 
                  isMissing={missingFields.includes('monthlyExpenses') && (snapshot.monthlyExpenses === null || Number.isNaN(snapshot.monthlyExpenses))}
                  microcopy="Rent, groceries, bills, and fun money."
                />
                
                {snapshot.monthlyIncome !== null && snapshot.monthlyExpenses !== null ? (
                  <SnapshotField 
                    label="Monthly Investing" 
                    val={snapshot.monthlyInvesting}
                    displayVal={snapshot.monthlyInvesting ?? 0}
                    fieldKey="monthlyInvesting" 
                    setSnapshot={setSnapshot} 
                    microcopy="Money you plan to put into assets every month."
                    hint={snapshot.monthlyInvesting === null ? "Not provided in your input. Defaulting to $0 until you enter a real monthly investing amount." : undefined}
                  />
                ) : null}

                <SnapshotField 
                  label="Invested Assets" 
                  val={snapshot.investedAssets} 
                  fieldKey="investedAssets" 
                   
                  setSnapshot={setSnapshot} 
                  isMissing={missingFields.includes('investedAssets') && (snapshot.investedAssets === null || Number.isNaN(snapshot.investedAssets))} 
                  microcopy="Stocks, ETFs, Crypto, or Real Estate (excluding primary home)."
                  pitfall="Your primary home is a liability, not an income-producing asset."
                />
                <SnapshotField 
                  label="Liquid Savings" 
                  val={snapshot.liquidSavings} 
                  fieldKey="liquidSavings" 
                   
                  setSnapshot={setSnapshot}
                  microcopy="Cash you can access immediately (Checking, Savings, Emergency fund)."
                  pitfall="Do not include locked term deposits."
                />
                <SnapshotField 
                  label="Total Debt" 
                  val={snapshot.debt} 
                  fieldKey="debt" 
                   
                  setSnapshot={setSnapshot}
                  microcopy="Mortgages, student loans, car loans, etc."
                />
                
                <HighInterestDebtField snapshot={snapshot} setSnapshot={setSnapshot} />

                <SnapshotField 
                  label="Passive Income" 
                  val={snapshot.passiveIncome} 
                  fieldKey="passiveIncome" 
                   
                  setSnapshot={setSnapshot}
                  microcopy="Money earned without actively working for it (e.g., dividends, rental income)."
                />
              </div>

              {/* Missing Info Prompts */}
              {(() => {
                const criticalFields = ['monthlyExpenses', 'investedAssets'];
                const originalCriticalMissing = missingFields.filter(f => criticalFields.includes(f));
                const currentCriticalMissing = originalCriticalMissing.filter(f => {
                  if (!snapshot) return true;
                  const val = (snapshot as any)[f];
                  return val === null || Number.isNaN(val);
                });
                
                return (
                  <div className="space-y-6 pt-4">
                    {originalCriticalMissing.length > 0 && (
                      <div className="bg-orange-900/10 border border-orange-900/50 rounded-xl p-5 space-y-4">
                        <div className="flex gap-2 text-orange-400 font-medium text-sm">
                          <Zap className="w-5 h-5 mt-0.5 shrink-0" /> 
                          {currentCriticalMissing.length > 0 
                            ? `We found most of your numbers. We need ${currentCriticalMissing.length === 2 ? 'two more numbers' : currentCriticalMissing.length > 1 ? 'a few more numbers' : 'one more number'} to calculate your FIRE path.`
                            : "All set! Ready to calculate your FIRE path."}
                        </div>
                        {originalCriticalMissing.map(f => (
                          <div key={f} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <label className="text-orange-300 font-medium w-full sm:w-1/2 text-sm">
                              {f === 'monthlyExpenses' && "Roughly how much do you spend per month?"}
                              {f === 'investedAssets' && "How much do you already have invested toward financial independence?"}
                              {f === 'targetMonthlySpending' && "What monthly spending would you want after reaching financial independence?"}
                            </label>
                            <input 
                              type="number" 
                              placeholder={
                                f === 'investedAssets' ? 'e.g., $120,000' :
                                f === 'targetMonthlySpending' ? 'e.g., $6,000/month' :
                                'e.g., $4,500/month'
                              }
                              className="p-2.5 border border-[var(--border)] rounded-lg bg-transparent text-white w-full sm:w-1/2 focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] outline-none"
                              onChange={e => {
                                const v = e.target.value;
                                setSnapshot(s => s ? ({ 
                                  ...s, 
                                  [f]: v !== '' ? parseFloat(v) : null,
                                  [`${f}Provided`]: v !== '' 
                                }) : null);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <details className="group bg-transparent border border-[var(--border)] rounded-xl p-4">
                        <summary className="cursor-pointer text-xs font-semibold tracking-wide text-[var(--text-muted)] flex items-center gap-2 select-none hover:text-[var(--text-primary)] transition-colors">
                          <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform shrink-0" />
                          <span><span className="mr-1">⚙️</span> Assumptions: Using standard FIRE rules (3% withdrawal, 4% return). Click to adjust.</span>
                        </summary>
                        <div className="mt-4 grid grid-cols-1 gap-4 text-sm pl-6 max-w-sm">
                          <label className="flex items-center justify-between gap-4">
                            <span className="text-[var(--text-muted)]">Expected annual real return</span>
                            <div className="relative flex items-center">
                              <input type="number" step="0.1" value={snapshot.expectedAnnualRealReturn !== null ? Math.round(snapshot.expectedAnnualRealReturn * 1000) / 10 : ''} placeholder="4" onChange={e => setSnapshot(s => s ? {...s, expectedAnnualRealReturn: e.target.value ? parseFloat(e.target.value) / 100 : null} : null)} className="w-24 p-1.5 pr-6 text-right bg-transparent border border-[var(--border)] rounded text-white outline-none focus:border-[var(--accent)]" />
                              <span className="absolute right-2 text-[var(--text-muted)] text-sm pointer-events-none">%</span>
                            </div>
                          </label>
                          <label className="flex items-center justify-between gap-4">
                            <span className="text-[var(--text-muted)]">Safe withdrawal rate</span>
                            <div className="relative flex items-center">
                              <input type="number" step="0.1" value={snapshot.safeWithdrawalRate !== null ? Math.round(snapshot.safeWithdrawalRate * 1000) / 10 : ''} placeholder="3" onChange={e => setSnapshot(s => s ? {...s, safeWithdrawalRate: e.target.value ? parseFloat(e.target.value) / 100 : null} : null)} className="w-24 p-1.5 pr-6 text-right bg-transparent border border-[var(--border)] rounded text-white outline-none focus:border-[var(--accent)]" />
                              <span className="absolute right-2 text-[var(--text-muted)] text-sm pointer-events-none">%</span>
                            </div>
                          </label>
                          <label className="flex items-center justify-between gap-4">
                            <span className="text-[var(--text-muted)]">Target FI spending/mo</span>
                            <div className="relative flex items-center">
                              <span className="absolute left-2 text-[var(--text-muted)] text-sm pointer-events-none">$</span>
                              <input type="number" value={snapshot.targetMonthlySpending ?? ''} placeholder={snapshot.monthlyExpenses?.toString() || "3000"} onChange={e => setSnapshot(s => s ? {...s, targetMonthlySpending: e.target.value ? parseFloat(e.target.value) : null} : null)} className="w-28 p-1.5 pl-6 text-right bg-transparent border border-[var(--border)] rounded text-white outline-none focus:border-[var(--accent)]" />
                            </div>
                          </label>
                        </div>
                      </details>
                  </div>
                );
              })()}

              {(() => {
                const criticalFields = ['monthlyExpenses', 'investedAssets'];
                const currentCriticalMissing = missingFields.filter(f => {
                  if (!criticalFields.includes(f)) return false;
                  if (!snapshot) return true;
                  const val = (snapshot as any)[f];
                  return val === null || Number.isNaN(val);
                });
                const isDisabled = currentCriticalMissing.length > 0;
                
                const firstMissing = currentCriticalMissing[0];
                const btnText = isDisabled 
                  ? currentCriticalMissing.length > 1 
                    ? 'Add Required Numbers to Continue'
                    : `Add ${firstMissing === 'investedAssets' ? 'Invested Assets' : 'Monthly Expenses'} to Continue` 
                  : 'Calculate My FIRE Path';

                return (
                  <button 
                    onClick={handleCalculate}
                    disabled={isDisabled}
                    className="w-full bg-[var(--accent)] text-black p-4 rounded-xl font-semibold text-lg hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center gap-2 mt-8"
                  >
                    {btnText}
                  </button>
                );
              })()}
            </motion.section>
          )}
        </AnimatePresence>

        {/* RESULTS DASHBOARD */}
        <AnimatePresence>
          {results && snapshot && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight text-white">Your Freedom Plan</h2>
                <button 
                  onClick={() => setResults(null)} 
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
                  aria-label="Back to Snapshot"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>

              {/* Main Headline */}
              <div className="glass p-8 sm:p-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                  <TrendingUp className="w-48 h-48" />
                </div>
                <div className="relative z-10 space-y-8">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-semibold">
                        {(results.calcs.yearsToFI === null || results.calcs.yearsToFI >= 100) && results.calcs.potentialYearsToFI !== null ? 'Potential Years to Freedom' : 'Years to Freedom'}
                      </div>
                      <div className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
                        {results.calcs.yearsToFI !== null && results.calcs.yearsToFI < 100 ? formatYears(results.calcs.yearsToFI) : 
                         (results.calcs.potentialYearsToFI !== null ? formatYears(results.calcs.potentialYearsToFI) : '∞ (Rat Race)')}
                      </div>
                    </div>
                    
                    <p className="text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">
                      {results.calcs.yearsToFI !== null && results.calcs.yearsToFI < 100 ? (
                        <>
                          Your estimated FIRE number is <strong className="text-white font-medium">{formatCurrency(results.calcs.fiNumber)}</strong>. At your current pace, you will buy back your freedom in about <strong className="text-[var(--accent)] font-medium">{formatYears(results.calcs.yearsToFI)}</strong>.
                          {(snapshot.investedAssets === 0 || snapshot.investedAssets === null) && results.calcs.effectiveMonthlyInvesting > 0 && (
                            <span className="block mt-2">You're starting from $0 invested assets, but your monthly investing power is strong. Consistency is your best asset now.</span>
                          )}
                        </>
                      ) : results.calcs.potentialYearsToFI !== null ? (
                        <>
                          <strong className="text-orange-400 font-medium text-base">You are Rich in Cash, Poor in Strategy.</strong>
                          <span className="block mt-2">
                            You have enough capital to potentially reach FIRE in <strong className="text-[var(--accent)]">{formatYears(results.calcs.potentialYearsToFI)}</strong> if you start deploying your cash today. Stop letting inflation eat your savings!
                          </span>
                        </>
                      ) : (
                        <>
                          <strong className="text-orange-400 font-medium text-base">Currently, you are stuck in the Rat Race forever.</strong>
                          <span className="block mt-2">
                            {snapshot.monthlyIncome && snapshot.monthlyExpenses && (snapshot.monthlyIncome - snapshot.monthlyExpenses > 0) ? 
                              `But wait... you have a surplus of ${formatCurrency(snapshot.monthlyIncome - snapshot.monthlyExpenses)} every month! You just need to deploy it into assets instead of letting it sit idle.` : 
                              `You are spending exactly what you earn (or more). To buy back your freedom, you must create a gap between your income and expenses.`
                            }
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  
                  {(() => {
                    const getStageInfo = (calcs: any) => {
                      if ((snapshot.investedAssets || 0) >= 100000 && calcs.effectiveMonthlyInvesting <= 0) {
                        return { stage: "Coast FIRE Mode", next: "Passive compounding" };
                      }
                      if (calcs.runwayMonths < 3) {
                        return { stage: "Foundation Builder", next: `3-month runway: ${formatCurrency((snapshot.monthlyExpenses || 0) * 3, snapshot.currency)}` };
                      } else if (calcs.fireProgress < 0.25) {
                        return { stage: "Momentum Builder", next: "25% FIRE Progress" };
                      } else if (calcs.fireProgress < 0.5) {
                        return { stage: "Coast FI Range", next: "50% FIRE Progress" };
                      } else if (calcs.fireProgress < 1) {
                        return { stage: "The Final Stretch", next: "100% FIRE" };
                      } else {
                        return { stage: "Financially Independent", next: "Enjoy the freedom!" };
                      }
                    };
                    const { stage, next } = getStageInfo(results.calcs);
                    
                    return (
                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 pt-6 border-t border-[var(--border)]">
                        <div>
                          <h4 className="text-[10px] tracking-widest uppercase text-[var(--text-muted)] font-semibold mb-1">Current Stage</h4>
                          <p className="text-sm font-medium text-white">{stage}</p>
                        </div>
                        <div>
                          <h4 className="text-[10px] tracking-widest uppercase text-[var(--text-muted)] font-semibold mb-1">Next Milestone</h4>
                          <p className="text-sm font-medium text-[var(--accent)]">{next}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 3 Progress Bars */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ProgressCard
                  title="FIRE Progress"
                  percentage={Math.min(results.calcs.fireProgress * 100, 100)}
                  value={(results.calcs.fireProgress * 100).toFixed(1)}
                  unit="%"
                  description={results.calcs.fireProgress <= 0.0001 ? "You're at the starting line. Your monthly investing rate is what matters most now." : "Invested assets / FIRE number"}
                  color="text-[var(--accent)]"
                />
                <ProgressCard
                  title="Cashflow Freedom"
                  percentage={Math.min(results.calcs.cashflowFreedom * 100, 100)}
                  value={(results.calcs.cashflowFreedom * 100).toFixed(1)}
                  unit="%"
                  description="Passive income / monthly expenses"
                  color="text-sky-500"
                  note={results.calcs.cashflowFreedom === 0 ? "0% covered by passive income. This is normal early on." : null}
                />
                <ProgressCard
                  title="Runway"
                  percentage={Math.min((results.calcs.runwayMonths / 6) * 100, 100)} // normalize relative to 6 months
                  value={results.calcs.runwayMonths.toFixed(1)}
                  unit="months"
                  description="Months your liquid savings can cover expenses"
                  color="text-orange-500"
                />
              </div>

              <AssumptionImpact snapshot={snapshot} />

              {/* Action Plan */}
              <div className="glass p-8 space-y-8">
                <div>
                  <h3 className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3">Biggest Blocker</h3>
                  <div className="bg-orange-900/10 px-4 py-3 rounded-xl border border-orange-900/50 flex items-start gap-3">
                    <Zap className="w-5 h-5 mt-0.5 shrink-0 text-orange-400" />
                    <div>
                      {results.actionPlan.blocker.split('\n').map((line, i) => (
                        <p key={i} className={i === 0 ? "text-lg font-medium text-orange-200" : "text-sm text-orange-300/80 mt-1"}>
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-4">Next 3 Money Moves</h3>
                  <div className="space-y-4">
                    {results.actionPlan.moves.map((move, idx) => (
                      <div key={idx} className="flex gap-4 p-4 rounded-xl bg-transparent border border-[var(--border)]">
                        <div className="w-7 h-7 rounded-full bg-[var(--border)] text-white text-sm font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        <div className="text-white text-base leading-tight self-center">
                          {move}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scenario Simulator */}
              <div className="space-y-4">
                 <h3 className="text-lg font-bold tracking-tight text-white">Scenario Simulator</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   {(() => {
                     const getScenarioContent = (type: ScenarioType) => {
                       if (activeScenario !== type || !baselineResults || !snapshot) return null;
                       
                       const newSnapshot = { ...snapshot };
                       const baselineInvesting = baselineResults.calcs.effectiveMonthlyInvesting;
                       const amount = scenarioAdjustments[type];
                       
                       if (type === 'invest') {
                         newSnapshot.monthlyInvesting = baselineInvesting + amount;
                       } else if (type === 'spend') {
                         newSnapshot.monthlyExpenses = Math.max(0, (snapshot.monthlyExpenses || 0) - amount);
                         if (snapshot.monthlyInvesting !== null) {
                           newSnapshot.monthlyInvesting = baselineInvesting + amount;
                         }
                       } else if (type === 'earn') {
                         newSnapshot.monthlyIncome = (snapshot.monthlyIncome || 0) + amount;
                         if (snapshot.monthlyInvesting !== null) {
                           newSnapshot.monthlyInvesting = baselineInvesting + amount;
                         }
                       }
                       
                       const calcs = calculateFIRE(newSnapshot);
                       const current = calcs.yearsToFI;
                       const baseline = baselineResults.calcs.yearsToFI;
                       
                       let changeText = "No change";
                       const curText = formatYears(current);
                       let impactText = "";
                       
                       if (baseline !== null && current !== null) {
                           const diff = baseline - current;
                           changeText = diff > 0.05 ? `${diff.toFixed(1)} years earlier` : diff < -0.05 ? `${Math.abs(diff).toFixed(1)} years later` : "No change";
                           
                           if (diff > 0.05) {
                               let extra = "";
                               if (type === 'spend') {
                                   const targetDrop = baselineResults.calcs.fiNumber - calcs.fiNumber;
                                   extra = `your FIRE target drops by ${formatCurrency(targetDrop)}, and `;
                               }
                               const actionWord = type === 'spend' ? 'cutting' : type === 'invest' ? 'investing' : 'earning';
                               impactText = `⚡ By ${actionWord} just ${formatCurrency(amount)}/mo, ${extra}you shave ${diff.toFixed(1)} YEARS off your working life!`;
                           }
                       } else if (baseline === null && current !== null) {
                           changeText = "Now on track to FIRE!";
                           impactText = `⚡ This single move breaks you out of the Rat Race! You are now on track to FIRE in ${formatYears(current)}.`;
                       } else {
                           changeText = "-";
                       }

                       return (
                         <div className="mt-3 pt-3 border-t border-[var(--accent)]/30 text-xs">
                           <div className="text-white font-medium">New FIRE date: {curText}</div>
                           {changeText !== "-" && changeText !== "No change" && <div className="text-[var(--accent)] mt-0.5">Change: {changeText}</div>}
                           {impactText && <div className="text-orange-300 font-medium leading-relaxed mt-2 p-2 bg-orange-900/20 rounded-md border border-orange-900/30">{impactText}</div>}
                         </div>
                       );
                     };
                     return (
                       <>
                         <ScenarioCard 
                           label={`Invest ${formatCurrency(scenarioAdjustments.invest, snapshot.currency)} more/mo`}
                           sub="Adds directly to your monthly investing pace"
                           amountLabel="Extra investing"
                           amount={scenarioAdjustments.invest}
                           onAmountChange={(value: number) => setScenarioAdjustments(prev => ({ ...prev, invest: value }))}
                           isActive={activeScenario === 'invest'}
                           activeContent={getScenarioContent('invest')}
                           onClick={() => handleScenario('invest')} 
                         />
                         <ScenarioCard 
                           label={`Spend ${formatCurrency(scenarioAdjustments.spend, snapshot.currency)} less/mo`}
                           sub="Lowers your FIRE number and can increase monthly surplus"
                           amountLabel="Monthly reduction"
                           amount={scenarioAdjustments.spend}
                           onAmountChange={(value: number) => setScenarioAdjustments(prev => ({ ...prev, spend: value }))}
                           isActive={activeScenario === 'spend'}
                           activeContent={getScenarioContent('spend')}
                           onClick={() => handleScenario('spend')} 
                         />
                         <ScenarioCard 
                           label={`Earn ${formatCurrency(scenarioAdjustments.earn, snapshot.currency)} more/mo`}
                           sub="Assumes the added income becomes investable surplus"
                           amountLabel="Added income"
                           amount={scenarioAdjustments.earn}
                           onAmountChange={(value: number) => setScenarioAdjustments(prev => ({ ...prev, earn: value }))}
                           isActive={activeScenario === 'earn'}
                           activeContent={getScenarioContent('earn')}
                           onClick={() => handleScenario('earn')} 
                         />
                       </>
                     );
                   })()}
                 </div>
              </div>

              {/* Email CTA */}
              <div className="glass border-emerald-500/30 bg-emerald-500/5 p-8 sm:p-10 text-center space-y-6">
                <div className="w-16 h-16 bg-[var(--accent)]/10 text-[var(--accent)] rounded-full flex items-center justify-center mx-auto">
                  <Mail className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold tracking-tight text-white">Want the full FIRE Roadmap?</h3>
                  <p className="text-[var(--text-muted)] text-sm max-w-xl mx-auto leading-relaxed">
                    Your free snapshot shows where you are today. The paid roadmap preview adds a 12-month plan, editable scenarios, monthly check-ins, and a shareable summary.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto pt-2 text-left">
                    {['12-month action plan', 'Custom scenario amounts', 'Monthly progress tracking', 'PDF-ready roadmap summary'].map(item => (
                      <div key={item} className="text-xs text-white bg-transparent border border-[var(--border)] rounded-lg px-3 py-2">{item}</div>
                    ))}
                  </div>
                  <div className="pt-2">
                    <p className="text-white font-medium text-sm">
                      Early access price: $9 for your first full roadmap.
                    </p>
                    <p className="text-xs text-[var(--accent)] font-medium mt-1">
                      Early access for the first 50 users
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-2">
                  <button onClick={() => { 
                    console.log('Tracking Event: free_beta_clicked');
                    openEmailModal('free');
                  }} className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3 rounded-lg border border-white/10 transition-colors text-sm w-full sm:w-auto text-center">
                    Join Free Newsletter
                  </button>
                  <button 
                    onClick={() => {
                      console.log('Tracking Event: paid_roadmap_tally_clicked', { price: 9 });
                      if (typeof window !== 'undefined' && window.posthog) {
                        window.posthog.capture('clicked_9_dollar_button');
                      }
                    }}
                    data-tally-open="VLDgzy" 
                    data-tally-layout="modal"
                    data-tally-emoji-text="👋" 
                    data-tally-emoji-animation="wave"
                    className="bg-[var(--accent)] hover:bg-emerald-400 text-black font-semibold px-8 py-3 rounded-lg transition-colors text-sm w-full sm:w-auto text-center"
                  >
                    Preview Full Roadmap - $9
                  </button>
                </div>
                
                <div className="max-w-xl mx-auto mt-6 p-4 rounded-xl border border-[var(--border)] bg-transparent text-sm text-[var(--text-muted)] text-left flex gap-3 leading-relaxed">
                  <span className="text-lg leading-none shrink-0">🛡️</span>
                  <p>
                    <strong className="text-white font-semibold">Beta Promise:</strong> This tool is in early beta. If you find a logic bug with your specific numbers, email me. I will manually fix your plan, refund your $9 completely, and you keep the roadmap.
                  </p>
                </div>

                <p className="text-[11px] text-[var(--text-muted)] mt-4">
                  Signup stores your email, first name, and selected intent. We do not store your full financial snapshot with the waitlist.
                </p>
              </div>

            </motion.section>
          )}
        </AnimatePresence>

      </main>

      {/* Footer */}
      <footer className="text-center px-6 py-6 sm:p-8 text-[10px] text-[var(--text-muted)] max-w-2xl mx-auto space-y-4">
        <p><strong className="font-semibold text-white">Disclaimer:</strong> This tool is for educational planning only, not financial advice. Smart input automatically extracts your numbers, confirmed snapshots are stored in this browser, and waitlist signup stores only contact details and intent.</p>
      </footer>

      {/* Email Modal */}
      <AnimatePresence>
        {emailOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass w-full max-w-md p-6 sm:p-8 relative"
            >
              <button 
                onClick={() => setEmailOpen(false)}
                className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-white p-2"
              >
                <X className="w-5 h-5"/>
              </button>
              
              {!emailSuccess ? (
                <form 
                  onSubmit={e => {
                    e.preventDefault();
                    setEmailSubmitting(true);
                    setEmailError(null);
                    
                    try {
                      const fd = new FormData(e.currentTarget);
                      const userEmail = fd.get('email') as string;
                      const userName = fd.get('firstName') as string || 'Not provided';
                      
                      // Change this to your actual receiving email address
                      const targetEmail = "273326413@qq.com"; 
                      const subject = encodeURIComponent(`New Waitlist Submission: ${userEmail}`);
                      const body = encodeURIComponent(`Name: ${userName}\nEmail: ${userEmail}`);
                      
                      window.location.href = `mailto:${targetEmail}?subject=${subject}&body=${body}`;
                      
                      setEmailSuccess(true);
                    } catch (e) {
                      console.error('Form submission error:', e);
                      setEmailSuccess(true);
                    } finally {
                      setEmailSubmitting(false);
                    }
                  }} 
                  className="space-y-6 pt-2"
                >
                  <div className="space-y-1">
                    <h3 className="text-2xl font-bold tracking-tight text-white">
                      {intentType === 'paid' ? 'You caught us early! 😅' : 'Almost there'}
                    </h3>
                    <p className="text-[var(--text-muted)] text-sm">
                      {intentType === 'paid' 
                        ? 'Our payment system is currently undergoing compliance review and we cannot accept payments today. But since you were ready to buy, leave your email below. I will send you the $9 Roadmap for FREE (or with a massive early-bird discount) the moment we go live.'
                        : 'Join our free newsletter for occasional FIRE tips, market stress tests, and product updates.'}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {intentType !== 'paid' && (
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">First Name (Optional)</label>
                        <input name="firstName" type="text" placeholder="John" className="w-full p-3 bg-transparent border border-[var(--border)] rounded-lg text-white outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">Email</label>
                      <input name="email" type="email" required placeholder="john@example.com" className="ph-no-capture w-full p-3 bg-transparent border border-[var(--border)] rounded-lg text-white outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" />
                    </div>
                    <label className="flex items-start gap-3 text-xs text-[var(--text-muted)] leading-snug cursor-pointer mt-2">
                      <input type="checkbox" required className="mt-0.5 rounded text-[var(--accent)] focus:ring-[var(--accent)] bg-transparent border-[var(--border)]" />
                      <span>I agree to receive occasional FIRE tips and product updates.</span>
                    </label>
                  </div>

                  {emailError && (
                    <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{emailError}</p>
                  )}

                  <button 
                    type="submit" 
                    disabled={emailSubmitting}
                    className="w-full bg-[var(--accent)] text-black font-semibold py-3.5 rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                  >
                    {emailSubmitting ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : (intentType === 'paid' ? "Get on the VIP List" : "Join Now")}
                  </button>
                </form>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-[var(--accent)]/10 text-[var(--accent)] rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-white">Thank you! You're on the list.</h3>
                  <p className="text-[var(--text-muted)] text-sm">
                    {intentType === 'paid' 
                      ? 'Thanks for joining! We will notify you as soon as the full FIRE roadmap is available.'
                      : 'Thanks for joining. We will send private beta updates and the deeper roadmap details when they are ready.'}
                  </p>
                  <button onClick={() => setEmailOpen(false)} className="mx-auto mt-6 inline-block font-medium text-[var(--accent)] hover:text-emerald-400 text-sm">Close</button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HighInterestDebtField({ snapshot, setSnapshot }: any) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  if (!(snapshot.debt > 0 || snapshot.hasHighInterestDebt === 'yes')) return null;

  return (
    <div 
      className={cn("p-4 rounded-xl border relative transition-colors cursor-text group col-span-1 sm:col-span-2", isFocused ? "border-[var(--accent)] bg-[#0D0E12]" : "border-[var(--border)] bg-[#0D0E12] hover:border-white/20")}
      onClick={() => !isFocused && setIsFocused(true)}
    >
      <div className="flex justify-between items-center mb-1">
        <label className="block uppercase tracking-widest text-[10px] font-semibold text-[var(--text-muted)] cursor-text">High-interest debt</label>
        {!isFocused && <Edit3 className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>

      <AnimatePresence>
        {isFocused && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="text-[11px] text-[var(--text-muted)] mb-2 opacity-80 leading-snug">
              Usually credit cards or personal loans with an interest rate &gt; 8%.
            </div>
            <div className="text-[11px] text-orange-400/80 mb-3 leading-snug flex gap-1 overflow-hidden">
              <Zap className="w-3 h-3 shrink-0 mt-0.5" />
              <span>Rates &gt; 8% are toxic to compound interest. Be honest here.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isFocused ? (
        <div className="space-y-4 mt-2" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-sm text-white mb-2">Is any of this high-interest debt?</p>
            <div className="flex flex-wrap gap-2">
              {['No / low-interest debt', 'Yes, some is high-interest', 'Not sure'].map((opt) => {
                const valMap: any = { 'No / low-interest debt': 'no', 'Yes, some is high-interest': 'yes', 'Not sure': 'not_sure' };
                const val = valMap[opt];
                const isSelected = snapshot.hasHighInterestDebt === val;
                return (
                  <button
                    key={opt}
                    onClick={() => setSnapshot((s: any) => s ? { ...s, hasHighInterestDebt: val, highInterestDebt: val !== 'yes' ? 0 : s.highInterestDebt } : null)}
                    className={cn("px-4 py-2 rounded-lg border text-sm transition-colors", isSelected ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] bg-[#1A1C21] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          
          {snapshot.hasHighInterestDebt === 'yes' && (
            <div className="pt-2 border-t border-[var(--border)]">
              <label className="text-sm text-white block mb-2 mt-2">How much high-interest debt do you have?</label>
              <div className="relative flex items-center w-full sm:w-1/2 mt-1">
                <span className="absolute left-3 text-[var(--text-muted)] pointer-events-none select-none font-medium">$</span>
                <input 
                  ref={inputRef}
                  type="number"
                  placeholder="5000"
                  value={snapshot.highInterestDebt === null ? '' : snapshot.highInterestDebt}
                  onBlur={() => {
                     setTimeout(() => setIsFocused(false), 200); // Allow clicks on buttons
                  }}
                  onChange={e => {
                     const v = e.target.value;
                     setSnapshot((s: any) => ({ ...s, highInterestDebt: v !== '' ? parseFloat(v) : null }));
                  }}
                  className="w-full bg-[#1A1C21] border border-[var(--border)] text-lg font-medium text-white outline-none focus:border-[var(--accent)] rounded-md pl-7 pr-2 py-1"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1">
          {snapshot.hasHighInterestDebt === 'yes' || (snapshot.highInterestDebt && snapshot.highInterestDebt > 0) ? (
            <div className="text-xl font-semibold text-orange-400 mt-1">
              {snapshot.highInterestDebt ? formatCurrency(snapshot.highInterestDebt, 'USD') : 'Yes (amount unknown)'}
            </div>
          ) : snapshot.hasHighInterestDebt === 'no' ? (
            <div className="text-lg font-medium text-[var(--text-primary)] mt-1">None</div>
          ) : (
            <div className="text-lg font-medium text-[var(--text-muted)] mt-1">Not sure</div>
          )}
        </div>
      )}
    </div>
  );
}

function SnapshotField({ label, val, displayVal, fieldKey, setSnapshot, isMissing = false, hint, microcopy, pitfall }: any) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div 
      className={cn(
        "p-4 rounded-xl border relative transition-colors cursor-text group", 
        isMissing ? "border-orange-900/50 bg-orange-900/10" : (isFocused ? "border-[var(--accent)] bg-[#0D0E12]" : "border-[var(--border)] bg-[#0D0E12] hover:border-white/20")
      )}
      onClick={() => !isFocused && setIsFocused(true)}
    >
      <div className="flex justify-between items-center mb-1">
        <label className="block uppercase tracking-widest text-[10px] font-semibold text-[var(--text-muted)] cursor-text">{label}</label>
        {!isFocused && <Edit3 className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      
      <AnimatePresence>
        {isFocused && microcopy && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-[11px] text-[var(--text-muted)] mb-2 opacity-80 leading-snug">
            {microcopy}
          </motion.div>
        )}
        
        {isFocused && pitfall && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-[11px] text-orange-400/80 mb-3 leading-snug flex gap-1 overflow-hidden">
            <Zap className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{pitfall}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {isFocused ? (
        <div className="relative flex items-center mt-1">
          <span className="absolute left-3 text-[var(--text-muted)] pointer-events-none select-none font-medium">$</span>
          <input 
            ref={inputRef}
            type="number"
            value={val === null ? '' : val}
            onBlur={() => setIsFocused(false)}
            onChange={e => {
               const v = e.target.value;
               setSnapshot((s: any) => ({ 
                 ...s, 
                 [fieldKey]: v !== '' ? parseFloat(v) : null,
                 [`${fieldKey}Provided`]: v !== ''
               }));
            }}
            className="w-full bg-[#1A1C21] border border-[var(--border)] text-lg font-medium text-white outline-none focus:border-[var(--accent)] rounded-md pl-7 pr-2 py-1"
          />
        </div>
      ) : (
        <div className="text-xl font-semibold text-[var(--text-primary)] mt-1">
           {isMissing ? <span className="text-orange-400 text-base font-normal flex items-center gap-1.5"><Zap className="w-4 h-4" /> Needed</span> : formatCurrency(displayVal ?? val)}
        </div>
      )}

      {hint && !isFocused && !isMissing && (
        <p className="text-[11px] text-[var(--text-muted)] opacity-80 mt-2">{hint}</p>
      )}
    </div>
  );
}

function AssumptionImpact({ snapshot }: { snapshot: FinancialSnapshot }) {
  const [stressTestActive, setStressTestActive] = useState(false);

  const baseReturn = snapshot.expectedAnnualRealReturn ?? defaultSnapshot.expectedAnnualRealReturn ?? 0.04;
  const baseWithdrawal = snapshot.safeWithdrawalRate ?? defaultSnapshot.safeWithdrawalRate ?? 0.03;
  const scenarios = [
    { label: 'Lower return', realReturn: 0.03, withdrawalRate: baseWithdrawal, note: '3% real return' },
    { label: 'Current plan', realReturn: baseReturn, withdrawalRate: baseWithdrawal, note: `${Math.round(baseReturn * 1000) / 10}% real return` },
    { label: 'Higher return', realReturn: 0.05, withdrawalRate: baseWithdrawal, note: '5% real return' },
    { label: '3.5% withdrawal', realReturn: baseReturn, withdrawalRate: 0.035, note: 'Changes the FIRE number' },
  ];

  const baseCalcs = calculateFIRE({
    ...snapshot,
    expectedAnnualRealReturn: baseReturn,
    safeWithdrawalRate: baseWithdrawal
  });
  
  const stressCalcs = calculateFIRE({
    ...snapshot,
    expectedAnnualRealReturn: 0.01,
    safeWithdrawalRate: baseWithdrawal
  });

  const getYearsStr = (calcs: any) => {
    if (calcs.yearsToFI !== null && calcs.yearsToFI < 100) return formatYears(calcs.yearsToFI);
    if (calcs.potentialYearsToFI !== null) return formatYears(calcs.potentialYearsToFI);
    return '∞ (Rat Race)';
  };

  const getEffectiveYears = (calcs: any) => {
    if (calcs.yearsToFI !== null && calcs.yearsToFI < 100) return calcs.yearsToFI;
    if (calcs.potentialYearsToFI !== null && calcs.potentialYearsToFI < 100) return calcs.potentialYearsToFI;
    return Infinity;
  };

  const isOutOReach = getEffectiveYears(baseCalcs) >= 80 || getEffectiveYears(stressCalcs) >= 80;

  return (
    <div className="glass p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h3 className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-2">Assumption Impact</h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            FIRE timelines are estimates. Small changes in return and withdrawal assumptions can move the target materially.
          </p>
        </div>
        <button 
          onClick={() => setStressTestActive(!stressTestActive)}
          className={cn(
            "shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-2 font-medium",
            stressTestActive 
              ? "bg-orange-500/10 border-orange-500/30 text-orange-400" 
              : "bg-[#1A1C21] border-[var(--border)] text-[var(--text-muted)] hover:text-white"
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          Stress Test (High Inflation / Low Return)
        </button>
      </div>

      <AnimatePresence>
        {stressTestActive && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-orange-400/90 text-sm leading-relaxed mt-1">
              {isOutOReach ? (
                <><strong>Stress Test:</strong> Under high inflation / low return scenarios, your goal becomes mathematically out of reach (Beyond 80 years).</>
              ) : (
                <><strong>Stress Test:</strong> If inflation rises or returns are lower (1% Real Return), your freedom date moves from <span className="font-semibold text-white">{getYearsStr(baseCalcs)}</span> to <span className="font-semibold text-white">{getYearsStr(stressCalcs)}</span>.</>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {scenarios.map(item => {
          const calcs = calculateFIRE({
            ...snapshot,
            expectedAnnualRealReturn: item.realReturn,
            safeWithdrawalRate: item.withdrawalRate
          });

          return (
            <div key={`${item.label}-${item.realReturn}-${item.withdrawalRate}`} className="bg-[#1A1C21] border border-[var(--border)] rounded-lg p-4">
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">{item.label}</div>
              <div className="text-lg font-semibold text-white mt-1">
                {getYearsStr(calcs)}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{formatCurrency(calcs.fiNumber, snapshot.currency)} target</div>
              <div className="text-[10px] text-[var(--accent)] mt-3">{item.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressCard({ title, percentage, value, unit, description, color, note }: any) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="glass p-6 flex flex-col justify-between items-center text-center space-y-4">
      <div className="w-full">
        <h4 className="font-semibold text-[var(--text-primary)] text-[10px] uppercase tracking-widest mb-1">{title}</h4>
        <p className="text-xs text-[var(--text-muted)] leading-tight">{description}</p>
      </div>
      
      <div className="relative flex items-center justify-center w-32 h-32 my-2">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-[#1A1C21] fill-none"
            strokeWidth="8"
          />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            className={cn("fill-none stroke-current", color)}
            strokeWidth="8"
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{ strokeDasharray: circumference }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-semibold text-2xl text-[var(--text-primary)] tracking-tight">{value}</span>
          <span className={cn("text-[10px] uppercase tracking-widest font-medium mt-0.5", color)}>{unit}</span>
        </div>
      </div>
      
      {note && <p className="text-[10px] text-[var(--text-muted)] italic">{note}</p>}
    </div>
  );
}

function ScenarioCard({ label, sub, amountLabel, amount, isActive, activeContent, onClick, onAmountChange }: any) {
  return (
    <div className={cn("p-4 rounded-xl border text-left transition-all duration-300 ease-in-out", isActive ? "border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/50" : "border-[var(--border)] bg-transparent hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/5 hover:-translate-y-1 hover:shadow-lg")}>
      <button type="button" onClick={onClick} className="w-full text-left cursor-pointer">
        <div className="font-semibold text-sm text-[var(--text-primary)] mb-0.5">{label}</div>
        <div className="text-xs text-[var(--text-muted)]">{sub}</div>
      </button>
      <label className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
        <span>{amountLabel}</span>
        <div className="relative w-28">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">$</span>
          <input
            type="number"
            min="0"
            step="50"
            value={amount === 0 ? '' : amount}
            placeholder="0"
            onChange={e => onAmountChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
            className="w-full bg-transparent border border-[var(--border)] rounded-md py-1.5 pl-5 pr-2 text-right text-white outline-none focus:border-[var(--accent)] transition-colors duration-300"
          />
        </div>
      </label>
      {activeContent}
    </div>
  );
}
