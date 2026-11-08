import fs from 'fs';
import path from 'path';

export interface SendLogEntry {
  cycle: number;
  slot: string;
  leadId: string;
  recipientEmail: string;
  mailbox: string;
  dueTimeIso: string;
  smtpAcceptTimeIso: string;
  messageId: string;
}

export interface LagAnalysisResult {
  totalSends: number;
  minLagSec: number;
  maxLagSec: number;
  meanLagSec: number;
  medianLagSec: number;
  stdDevSec: number;
  regressionSlopeBeta: number;
  regressionInterceptAlpha: number;
  rSquared: number;
  isRatcheting: boolean;
  samples: Array<{
    index: number;
    slot: string;
    dueTime: string;
    actualTime: string;
    lagSec: number;
  }>;
}

export function analyzeSoakLogFile(logFilePath: string): LagAnalysisResult {
  if (!fs.existsSync(logFilePath)) {
    throw new Error(`Log file not found: ${logFilePath}`);
  }

  const rawLines = fs.readFileSync(logFilePath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const entries: SendLogEntry[] = rawLines.map((l) => JSON.parse(l));

  if (entries.length < 2) {
    throw new Error(`At least 2 send records required for lag regression analysis, found ${entries.length}`);
  }

  const samples = entries.map((entry, idx) => {
    const dueMs = new Date(entry.dueTimeIso).getTime();
    const actualMs = new Date(entry.smtpAcceptTimeIso).getTime();
    const lagSec = (actualMs - dueMs) / 1000;
    return {
      index: idx + 1,
      slot: entry.slot,
      dueTime: entry.dueTimeIso,
      actualTime: entry.smtpAcceptTimeIso,
      lagSec,
    };
  });

  const lags = samples.map((s) => s.lagSec);
  const n = lags.length;

  const minLagSec = Math.min(...lags);
  const maxLagSec = Math.max(...lags);
  const meanLagSec = lags.reduce((a, b) => a + b, 0) / n;

  const sortedLags = [...lags].sort((a, b) => a - b);
  const medianLagSec = n % 2 === 0
    ? (sortedLags[n / 2 - 1] + sortedLags[n / 2]) / 2
    : sortedLags[Math.floor(n / 2)];

  const variance = lags.reduce((sum, val) => sum + Math.pow(val - meanLagSec, 2), 0) / n;
  const stdDevSec = Math.sqrt(variance);

  // Ordinary Least Squares (OLS) Linear Regression: Lag = alpha + beta * index
  const xMean = (n + 1) / 2;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = lags[i];
    numerator += (x - xMean) * (y - meanLagSec);
    denominator += Math.pow(x - xMean, 2);
  }

  const regressionSlopeBeta = numerator / denominator;
  const regressionInterceptAlpha = meanLagSec - regressionSlopeBeta * xMean;

  // Compute R-squared
  let ssTotal = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = lags[i];
    const yPred = regressionInterceptAlpha + regressionSlopeBeta * x;
    ssTotal += Math.pow(y - meanLagSec, 2);
    ssRes += Math.pow(y - yPred, 2);
  }
  const rSquared = ssTotal > 0 ? 1 - ssRes / ssTotal : 0;

  // Ratcheting is defined as persistent positive drift across cycles (beta > 0.05 s/send)
  const isRatcheting = regressionSlopeBeta > 0.05;

  return {
    totalSends: n,
    minLagSec,
    maxLagSec,
    meanLagSec,
    medianLagSec,
    stdDevSec,
    regressionSlopeBeta,
    regressionInterceptAlpha,
    rSquared,
    isRatcheting,
    samples,
  };
}

// Standalone execution: npx tsx analyzeSoakLog.ts <path-to-logfile>
if (process.argv[1]?.endsWith('analyzeSoakLog.ts')) {
  const logFile = process.argv[2] || path.resolve(process.cwd(), 'server', 'data', 'soak_send_log.jsonl');
  try {
    const analysis = analyzeSoakLogFile(logFile);
    console.log('========================================================================');
    console.log('📈 EMPIRICAL TIMING & LAG ANALYSIS (ORDINARY LEAST SQUARES)');
    console.log('========================================================================\n');
    console.log(`Source Log:               ${logFile}`);
    console.log(`Total Dispatches Analyzed: ${analysis.totalSends}`);
    console.log(`Minimum Measured Lag:     ${analysis.minLagSec.toFixed(3)}s`);
    console.log(`Maximum Measured Lag:     ${analysis.maxLagSec.toFixed(3)}s`);
    console.log(`Empirical Mean Lag:       ${analysis.meanLagSec.toFixed(3)}s`);
    console.log(`Median Lag:               ${analysis.medianLagSec.toFixed(3)}s`);
    console.log(`Standard Deviation (σ):   ${analysis.stdDevSec.toFixed(3)}s`);
    console.log(`OLS Regression Slope (β): ${analysis.regressionSlopeBeta.toFixed(6)} s/send`);
    console.log(`Regression Intercept (α): ${analysis.regressionInterceptAlpha.toFixed(3)}s`);
    console.log(`R-squared (R²):           ${analysis.rSquared.toFixed(4)}`);
    console.log(`Ratcheting Detected:      ${analysis.isRatcheting ? 'YES (UNSTABLE)' : 'NO (STABLE - NON-RATCHETING)'}\n`);

    console.log('Per-Send Breakdown:');
    analysis.samples.forEach((s) => {
      console.log(`  [Send #${s.index.toString().padStart(2, '0')}] Slot ${s.slot} | Due: ${s.dueTime.slice(11, 23)} | SMTP Accept: ${s.actualTime.slice(11, 23)} | Lag: ${s.lagSec >= 0 ? '+' : ''}${s.lagSec.toFixed(3)}s`);
    });
    console.log('\n========================================================================\n');
  } catch (err: any) {
    console.error('Analysis failed:', err.message);
    process.exit(1);
  }
}

