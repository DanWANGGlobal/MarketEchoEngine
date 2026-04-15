import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import yahooFinanceOriginal from 'yahoo-finance2';
import { Matrix } from 'ml-matrix';
import DTW from 'dtw';
import dns from 'dns';

// Force IPv4 first to prevent undici ConnectTimeoutError in environments with broken IPv6
dns.setDefaultResultOrder('ipv4first');

// Instantiate YahooFinance to avoid "Call new YahooFinance() first" error
// In some versions, the default export is the class itself
const yahooFinance = new (yahooFinanceOriginal as any)();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Endpoints
  app.post('/api/analyze', async (req, res) => {
    try {
      const { ticker = '^NDX', targetStartDate, targetEndDate, historyYears = 20 } = req.body;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - historyYears);

      // Fetch Ticker Info
      let fullName = ticker;
      try {
        const quote = await yahooFinance.quote(ticker);
        fullName = quote.longName || quote.shortName || ticker;
      } catch (e) {
        console.warn('Could not fetch ticker info');
      }

      // Fetch historical data
      const historyData = (await yahooFinance.historical(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      })) as any[];

      if (!historyData || historyData.length === 0) {
        return res.status(404).json({ error: 'No data found for ticker' });
      }

      const prices = historyData.map(d => d.close);
      const dates = historyData.map(d => d.date);

      // Find target window indices
      const tStart = new Date(targetStartDate);
      const tEnd = new Date(targetEndDate);
      
      let targetStartIndex = -1;
      let targetEndIndex = -1;

      for (let i = 0; i < dates.length; i++) {
        const d = new Date(dates[i]);
        if (targetStartIndex === -1 && d >= tStart) targetStartIndex = i;
        if (d <= tEnd) targetEndIndex = i;
      }

      if (targetStartIndex === -1 || targetEndIndex === -1 || targetStartIndex >= targetEndIndex) {
        return res.status(400).json({ error: 'Invalid target date range or no data in range' });
      }

      const windowSize = targetEndIndex - targetStartIndex;
      const targetPrices = prices.slice(targetStartIndex, targetEndIndex + 1);
      const targetDates = dates.slice(targetStartIndex, targetEndIndex + 1);

      // Calculate returns for target
      const targetReturns: number[] = [];
      for (let i = 1; i < targetPrices.length; i++) {
        targetReturns.push((targetPrices[i] - targetPrices[i - 1]) / targetPrices[i - 1]);
      }

      // Calculate returns for entire history
      const allReturns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        allReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }

      // Helper for metrics
      const calculateMetrics = (segmentReturns: number[], segmentPrices: number[]) => {
        const firstPrice = segmentPrices[0];
        const lastPrice = segmentPrices[segmentPrices.length - 1];
        const periodPerformance = (lastPrice - firstPrice) / firstPrice;
        
        const mean = segmentReturns.reduce((a, b) => a + b, 0) / segmentReturns.length;
        const dailyVol = Math.sqrt(segmentReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / segmentReturns.length);
        
        const annualizedPerf = Math.pow(1 + Math.abs(periodPerformance), 252 / segmentReturns.length) - 1;
        const finalAnnualizedPerf = periodPerformance < 0 ? -annualizedPerf : annualizedPerf;
        const annualizedVol = dailyVol * Math.sqrt(252);
        const sharpe = annualizedVol === 0 ? 0 : finalAnnualizedPerf / annualizedVol;

        return {
          periodPerformance,
          dailyVol,
          annualizedPerf: finalAnnualizedPerf,
          annualizedVol,
          sharpe
        };
      };

      const targetMetrics = calculateMetrics(targetReturns, targetPrices);

      // Volatility Normalization (Z-Score)
      const normalize = (seq: number[]) => {
        const mean = seq.reduce((a, b) => a + b, 0) / seq.length;
        const std = Math.sqrt(seq.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / seq.length);
        return seq.map(v => (v - mean) / (std || 1));
      };

      const normTargetReturns = normalize(targetReturns);

      const segments: any[] = [];
      const dtw = new DTW();

      // Sliding window traversal
      // Skip the target window itself
      const forwardDays = 126; // Approx 6 months of trading days
      for (let i = 0; i <= allReturns.length - windowSize; i++) {
        // Avoid overlapping with the target window if possible, or just skip the exact match
        if (i >= targetStartIndex - 5 && i <= targetStartIndex + 5) continue;

        const histReturns = allReturns.slice(i, i + windowSize);
        const histPrices = prices.slice(i, i + windowSize + 1);
        const normHistReturns = normalize(histReturns);

        const correlation = calculateCorrelation(normTargetReturns, normHistReturns);
        const distance = dtw.compute(normTargetReturns, normHistReturns);

        const forwardEndIndex = Math.min(prices.length, i + windowSize + 1 + forwardDays);
        const forwardPrices = prices.slice(i + windowSize + 1, forwardEndIndex);
        const forwardDates = dates.slice(i + windowSize + 1, forwardEndIndex);

        segments.push({
          startIndex: i,
          correlation,
          distance,
          dates: dates.slice(i, i + windowSize + 1),
          prices: histPrices,
          returns: histReturns,
          metrics: calculateMetrics(histReturns, histPrices),
          forwardPrices,
          forwardDates
        });
      }

      // Sort
      const topCorrelation = [...segments].sort((a, b) => b.correlation - a.correlation).slice(0, 10);
      const bottomCorrelation = [...segments].sort((a, b) => a.correlation - b.correlation).slice(0, 10);
      const topDTW = [...segments].sort((a, b) => a.distance - b.distance).slice(0, 10);

      res.json({
        fullName,
        recent: {
          prices: targetPrices,
          dates: targetDates,
          returns: targetReturns,
          metrics: targetMetrics
        },
        fullHistory: {
          prices,
          dates
        },
        topCorrelation,
        bottomCorrelation,
        topDTW,
      });
    } catch (error: any) {
      console.error('Analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  function calculateCorrelation(x: number[], y: number[]) {
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
