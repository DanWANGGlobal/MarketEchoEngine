import React, { useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  Label as RechartsLabel
} from 'recharts';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Calendar, 
  Clock, 
  BarChart3,
  RefreshCw,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, subMonths } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Segment {
  startIndex: number;
  correlation: number;
  distance: number;
  dates: string[];
  prices: number[];
  returns: number[];
  forwardPrices?: number[];
  forwardDates?: string[];
  metrics: {
    periodPerformance: number;
    dailyVol: number;
    annualizedPerf: number;
    annualizedVol: number;
    sharpe: number;
  };
}

interface AnalysisResult {
  fullName: string;
  recent: {
    prices: number[];
    dates: string[];
    returns: number[];
    metrics: {
      periodPerformance: number;
      dailyVol: number;
      annualizedPerf: number;
      annualizedVol: number;
      sharpe: number;
    };
  };
  fullHistory: {
    prices: number[];
    dates: string[];
  };
  topCorrelation: Segment[];
  bottomCorrelation: Segment[];
  topDTW: Segment[];
}

export default function App() {
  const [ticker, setTicker] = useState('^NDX');
  const [targetStartDate, setTargetStartDate] = useState(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [targetEndDate, setTargetEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [historyYears, setHistoryYears] = useState(20);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const reportRef = React.useRef<HTMLDivElement>(null);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, targetStartDate, targetEndDate, historyYears }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Analysis failed');
      }
      
      const data = await response.json();
      setResult(data);
      toast.success('Analysis completed successfully');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    if (!reportRef.current) return;
    setLoading(true);
    setIsExporting(true);
    
    // Wait for React to render the exporting header
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = pdfWidth - 20; // 10mm margin on each side
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      
      let yPos = 10;
      let remainingHeight = imgHeight;
      
      pdf.addImage(imgData, 'PNG', 10, yPos, imgWidth, imgHeight);
      remainingHeight -= (pdfHeight - yPos);
      
      while (remainingHeight > 0) {
        pdf.addPage();
        const yOffset = -(imgHeight - remainingHeight);
        pdf.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
        remainingHeight -= pdfHeight;
      }
      
      pdf.save(`MarketEchoEngine_${ticker}_${format(new Date(), 'yyyyMMdd')}.pdf`);
      toast.success('PDF exported successfully');
    } catch (error) {
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
      setLoading(false);
    }
  };

  const exportCSV = (data: Segment[], title: string) => {
    const headers = ['Start Date', 'End Date', 'Correlation', 'DTW Distance', 'Period Return', 'Ann. Return', 'Ann. Vol', 'Sharpe'];
    const rows = data.map(seg => [
      format(parseISO(seg.dates[0]), 'yyyy-MM-dd'),
      format(parseISO(seg.dates[seg.dates.length - 1]), 'yyyy-MM-dd'),
      seg.correlation.toFixed(4),
      seg.distance.toFixed(4),
      (seg.metrics.periodPerformance * 100).toFixed(2) + '%',
      (seg.metrics.annualizedPerf * 100).toFixed(2) + '%',
      (seg.metrics.annualizedVol * 100).toFixed(2) + '%',
      seg.metrics.sharpe.toFixed(4)
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${title}_${ticker}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-2 font-extrabold text-lg tracking-tighter text-[var(--primary)]">
          <Activity className="w-6 h-6 stroke-[3]" />
          MarketEchoEngine | Dan@TraderX-Flow
        </div>
        
        <div className="hidden md:flex items-center gap-4">
          <div className="flex flex-col">
            <span className="theme-control-label">Instrument</span>
            <span className="theme-control-value truncate max-w-[150px]">{result?.fullName || ticker}</span>
          </div>
          <div className="flex flex-col">
            <span className="theme-control-label">Window</span>
            <span className="theme-control-value">Custom Range</span>
          </div>
          <div className="flex flex-col">
            <span className="theme-control-label">Horizon</span>
            <span className="theme-control-value">{historyYears} Years</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {result && (
            <Button 
              onClick={exportPDF} 
              variant="outline"
              size="sm"
              className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider"
            >
              <FileText className="w-3 h-3 mr-1" />
              Export PDF
            </Button>
          )}
          <Button 
            onClick={runAnalysis} 
            disabled={loading}
            size="sm"
            className="bg-[var(--primary)] hover:bg-blue-700 text-white font-bold uppercase text-[10px] tracking-wider h-8 px-4"
          >
            {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3 mr-1" />}
            {loading ? 'Analyzing' : 'Run Analysis'}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {!result && !loading ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[var(--grid-bg)]">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-border flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-[var(--muted-foreground)]" />
            </div>
            <h2 className="text-xl font-bold mb-2">Ready for Analysis</h2>
            <p className="text-[var(--muted-foreground)] max-w-md mb-8">
              Configure your parameters below and run the engine to find historical market patterns.
            </p>
            
            <Card className="w-full max-w-2xl border-border shadow-sm">
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="theme-control-label">Ticker Symbol</Label>
                  <Input 
                    value={ticker} 
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="h-9 text-sm font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="theme-control-label">History Range (Years)</Label>
                  <Input 
                    type="number"
                    value={historyYears} 
                    onChange={(e) => setHistoryYears(Number(e.target.value))}
                    className="h-9 text-sm font-semibold"
                    min={1}
                    max={30}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="theme-control-label">Target Start Date</Label>
                  <Input 
                    type="date"
                    value={targetStartDate} 
                    onChange={(e) => setTargetStartDate(e.target.value)}
                    className="h-9 text-sm font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="theme-control-label">Target End Date</Label>
                  <Input 
                    type="date"
                    value={targetEndDate} 
                    onChange={(e) => setTargetEndDate(e.target.value)}
                    className="h-9 text-sm font-semibold"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full overflow-y-auto bg-[var(--grid-bg)]">
            <div ref={reportRef} className="flex flex-col gap-4 p-4 bg-[var(--grid-bg)]">
              
              {isExporting && (
                <div className="mb-2 pb-4 border-b border-border">
                  <h1 className="text-2xl font-bold text-[var(--primary)]">MarketEchoEngine@TraderX-Flow</h1>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">Dan@微信公众号【TraderX-Flow】 | {format(new Date(), 'yyyy-MM-dd HH:mm')}</p>
                </div>
              )}

              {/* Top Section: Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
              {/* Normalized Comparison */}
              <section className="card flex flex-col bg-white border border-border rounded-xl overflow-hidden shadow-sm min-h-[450px]">
                <div className="theme-card-header flex justify-between items-center">
                  <div className="flex flex-col">
                    <h2 className="theme-card-title">Normalized Pattern Match</h2>
                    <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold">Z-Score Volatility Adjusted</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold">MATCH #1</Badge>
                </div>
                <div className="flex-1 p-6 flex flex-col">
                  {result && result.topCorrelation && result.topCorrelation.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6 p-3 bg-[var(--grid-bg)] rounded-lg border border-border">
                        <div className="flex flex-col">
                          <span className="theme-control-label">Period Ret</span>
                          <span className={`text-[11px] font-bold ${result.recent.metrics.periodPerformance >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                            {(result.recent.metrics.periodPerformance * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="theme-control-label">Ann. Ret</span>
                          <span className="text-[11px] font-bold">{(result.recent.metrics.annualizedPerf * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="theme-control-label">Ann. Vol</span>
                          <span className="text-[11px] font-bold">{(result.recent.metrics.annualizedVol * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="theme-control-label">Sharpe</span>
                          <span className="text-[11px] font-bold">{result.recent.metrics.sharpe.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="theme-control-label">Target Range</span>
                          <span className="text-[9px] font-bold leading-tight">
                            {format(parseISO(result.recent.dates[0]), 'yyyy-MM-dd')}<br/>
                            {format(parseISO(result.recent.dates[result.recent.dates.length - 1]), 'yyyy-MM-dd')}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={prepareChartData(result.recent.prices, result.topCorrelation[0].prices)}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="index" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip 
                              contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="recent" 
                              stroke="var(--primary)" 
                              strokeWidth={3} 
                              dot={false} 
                              name={`Current (${result.fullName}: ${format(parseISO(result.recent.dates[0]), 'yyyy-MM-dd')} to ${format(parseISO(result.recent.dates[result.recent.dates.length - 1]), 'yyyy-MM-dd')})`}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="historical" 
                              stroke="var(--accent-amber)" 
                              strokeWidth={2} 
                              strokeDasharray="4 4" 
                              dot={false} 
                              name={`Best Match (${format(parseISO(result.topCorrelation[0].dates[0]), 'yyyy-MM-dd')} to ${format(parseISO(result.topCorrelation[0].dates[result.topCorrelation[0].dates.length - 1]), 'yyyy-MM-dd')})`}
                              opacity={0.6}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Actual Price Comparison */}
              <section className="card flex flex-col bg-white border border-border rounded-xl overflow-hidden shadow-sm min-h-[450px]">
                <div className="theme-card-header flex justify-between items-center">
                  <div className="flex flex-col">
                    <h2 className="theme-card-title">Actual Price Comparison</h2>
                    <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold">Non-Normalized Trends</span>
                  </div>
                </div>
                <div className="flex-1 p-6 flex flex-col gap-6">
                  <div className="flex-1 flex flex-col border border-border rounded-lg p-4 bg-[var(--grid-bg)]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold uppercase text-[var(--primary)]">Target: {result?.fullName}</span>
                      <span className="text-[9px] font-medium text-[var(--muted-foreground)]">
                        {result && format(parseISO(result.recent.dates[0]), 'yyyy-MM-dd')} to {result && format(parseISO(result.recent.dates[result.recent.dates.length - 1]), 'yyyy-MM-dd')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={result?.recent.prices.map((p, i) => ({ p, i }))}>
                          <Line type="monotone" dataKey="p" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
                          <XAxis hide />
                          <YAxis domain={['auto', 'auto']} fontSize={10} stroke="var(--muted-foreground)" />
                          <Tooltip />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col border border-border rounded-lg p-4 bg-[var(--grid-bg)]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold uppercase text-[var(--accent-amber)]">Best Match + 6M Forward</span>
                      <span className="text-[9px] font-medium text-[var(--muted-foreground)]">
                        {result && format(parseISO(result.topCorrelation[0].dates[0]), 'yyyy-MM-dd')} to {result && result.topCorrelation[0].forwardDates && result.topCorrelation[0].forwardDates.length > 0 ? format(parseISO(result.topCorrelation[0].forwardDates[result.topCorrelation[0].forwardDates.length - 1]), 'yyyy-MM-dd') : 'N/A'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={prepareForwardData(result?.topCorrelation[0])}>
                          <XAxis dataKey="index" hide />
                          <YAxis domain={['auto', 'auto']} fontSize={10} stroke="var(--muted-foreground)" />
                          <Tooltip />
                          {result?.topCorrelation[0] && (
                            <ReferenceArea 
                              x1={0} 
                              x2={result.topCorrelation[0].prices.length - 1} 
                              {...{fill: "var(--accent-amber)", opacity: 0.1} as any}
                            >
                              <RechartsLabel value="Best Match" position="insideTop" fill="var(--accent-amber)" fontSize={10} fontWeight="bold" />
                            </ReferenceArea>
                          )}
                          <Line type="monotone" dataKey="match" stroke="var(--accent-amber)" strokeWidth={2.5} dot={false} />
                          <Line type="monotone" dataKey="forward" stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="3 3" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Full Horizon Price Trend */}
            {result && result.fullHistory && (
              <section className="card bg-white border border-border rounded-xl overflow-hidden shadow-sm shrink-0">
                <div className="theme-card-header flex justify-between items-center">
                  <div className="flex flex-col">
                    <h2 className="theme-card-title">Full Horizon Price Trend</h2>
                    <span className="text-[10px] text-[var(--muted-foreground)] uppercase font-bold">Top 3 High Similarity Periods Highlighted</span>
                  </div>
                </div>
                <div className="p-6 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.fullHistory.prices.map((p, i) => ({ date: format(parseISO(result.fullHistory.dates[i]), 'yyyy-MM-dd'), price: p }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="date" 
                        tick={{fontSize: 10}} 
                        minTickGap={50}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        tick={{fontSize: 10}} 
                        orientation="right"
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip 
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="price" stroke="var(--muted-foreground)" strokeWidth={1.5} dot={false} />
                      
                      {result.topCorrelation.slice(0, 3).map((seg, idx) => {
                        const start = format(parseISO(seg.dates[0]), 'yyyy-MM-dd');
                        const end = format(parseISO(seg.dates[seg.dates.length - 1]), 'yyyy-MM-dd');
                        const colors = ['var(--positive)', 'var(--primary)', 'var(--accent-amber)'];
                        return (
                          <React.Fragment key={idx}>
                            <ReferenceArea 
                              x1={start} 
                              x2={end} 
                              {...{fill: colors[idx], opacity: 0.2} as any}
                            >
                              <RechartsLabel 
                                value={`Match #${idx + 1}`} 
                                position="insideTop" 
                                fill={colors[idx]} 
                                fontSize={10} 
                                fontWeight="bold" 
                              />
                            </ReferenceArea>
                          </React.Fragment>
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Middle Section: Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
              {/* Top 10 High Similarity */}
              <section className="card bg-white border border-border rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[400px]">
                <div className="theme-card-header flex justify-between items-center">
                  <h2 className="theme-card-title">Top 10: High Similarity</h2>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => exportCSV(result?.topCorrelation || [], 'High_Similarity')}
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <Table>
                    <TableHeader className="bg-[var(--grid-bg)]">
                      <TableRow className="hover:bg-transparent border-b border-border">
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8">Period (Start/End)</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">DTW</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Corr</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Ret</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Ann.R</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Ann.V</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Sharpe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result?.topCorrelation.map((seg, i) => (
                        <TableRow key={i} className="hover:bg-slate-50 border-b border-border">
                          <TableCell className="py-2 text-[10px] font-medium leading-tight">
                            {format(parseISO(seg.dates[0]), 'yyyy-MM-dd')}<br/>
                            {format(parseISO(seg.dates[seg.dates.length - 1]), 'yyyy-MM-dd')}
                          </TableCell>
                          <TableCell className="py-2 text-[11px] text-right font-mono">{seg.distance.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="theme-stat-pill theme-stat-high text-[10px]">{(seg.correlation).toFixed(2)}</span>
                          </TableCell>
                          <TableCell className={`py-2 text-right text-[10px] font-bold ${seg.metrics.periodPerformance >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                            {(seg.metrics.periodPerformance * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className="py-2 text-right text-[10px]">{(seg.metrics.annualizedPerf * 100).toFixed(1)}%</TableCell>
                          <TableCell className="py-2 text-right text-[10px]">{(seg.metrics.annualizedVol * 100).toFixed(1)}%</TableCell>
                          <TableCell className="py-2 text-right text-[10px] font-bold">{seg.metrics.sharpe.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </section>

              {/* Top 10 Divergent Patterns */}
              <section className="card bg-white border border-border rounded-xl overflow-hidden shadow-sm flex flex-col min-h-[400px]">
                <div className="theme-card-header flex justify-between items-center">
                  <h2 className="theme-card-title">Top 10: Divergent Patterns</h2>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => exportCSV(result?.bottomCorrelation || [], 'Divergent_Patterns')}
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <Table>
                    <TableHeader className="bg-[var(--grid-bg)]">
                      <TableRow className="hover:bg-transparent border-b border-border">
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8">Period (Start/End)</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">DTW</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Corr</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Ret</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Ann.R</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Ann.V</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] h-8 text-right">Sharpe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result?.bottomCorrelation.map((seg, i) => (
                        <TableRow key={i} className="hover:bg-slate-50 border-b border-border">
                          <TableCell className="py-2 text-[10px] font-medium leading-tight">
                            {format(parseISO(seg.dates[0]), 'yyyy-MM-dd')}<br/>
                            {format(parseISO(seg.dates[seg.dates.length - 1]), 'yyyy-MM-dd')}
                          </TableCell>
                          <TableCell className="py-2 text-[11px] text-right font-mono">{seg.distance.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right">
                            <span className="theme-stat-pill theme-stat-low text-[10px]">{(seg.correlation).toFixed(2)}</span>
                          </TableCell>
                          <TableCell className={`py-2 text-right text-[10px] font-bold ${seg.metrics.periodPerformance >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                            {(seg.metrics.periodPerformance * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className="py-2 text-right text-[10px]">{(seg.metrics.annualizedPerf * 100).toFixed(1)}%</TableCell>
                          <TableCell className="py-2 text-right text-[10px]">{(seg.metrics.annualizedVol * 100).toFixed(1)}%</TableCell>
                          <TableCell className="py-2 text-right text-[10px] font-bold">{seg.metrics.sharpe.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </section>
            </div>

            {/* Bottom Section: Visualization Grid */}
            <section className="card bg-white border border-border rounded-xl overflow-hidden shadow-sm flex flex-col shrink-0">
              <div className="theme-card-header flex justify-between items-center">
                <h2 className="theme-card-title">Pattern Visualization Grid</h2>
                <div className="flex gap-2">
                  <span className="theme-tag theme-tag-blue">High Match</span>
                  <span className="theme-tag theme-tag-amber">Inverse</span>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* High Correlation Column */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] px-2">High Correlation</h3>
                    {result?.topCorrelation?.map((seg, idx) => (
                      <div key={idx} className="border border-border rounded-lg p-3 bg-[var(--grid-bg)]">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold leading-tight">
                              {format(parseISO(seg.dates[0]), 'yyyy-MM-dd')} to<br/>
                              {format(parseISO(seg.dates[seg.dates.length - 1]), 'yyyy-MM-dd')}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--positive)]">{(seg.correlation * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-[100px]">
                          <PatternMiniChart recent={result.recent.prices} historical={seg.prices} color="var(--positive)" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Low Correlation Column */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] px-2">Low Correlation</h3>
                    {result?.bottomCorrelation?.map((seg, idx) => (
                      <div key={idx} className="border border-border rounded-lg p-3 bg-[var(--grid-bg)]">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold leading-tight">
                              {format(parseISO(seg.dates[0]), 'yyyy-MM-dd')} to<br/>
                              {format(parseISO(seg.dates[seg.dates.length - 1]), 'yyyy-MM-dd')}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--negative)]">{(seg.correlation * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-[100px]">
                          <PatternMiniChart recent={result.recent.prices} historical={seg.prices} color="var(--negative)" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DTW Column */}
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase text-[var(--muted-foreground)] px-2">DTW Similarity</h3>
                    {result?.topDTW?.map((seg, idx) => (
                      <div key={idx} className="border border-border rounded-lg p-3 bg-[var(--grid-bg)]">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold leading-tight">
                              {format(parseISO(seg.dates[0]), 'yyyy-MM-dd')} to<br/>
                              {format(parseISO(seg.dates[seg.dates.length - 1]), 'yyyy-MM-dd')}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--primary)]">Dist: {seg.distance.toFixed(2)}</span>
                        </div>
                        <div className="h-[100px]">
                          <PatternMiniChart recent={result.recent.prices} historical={seg.prices} color="var(--primary)" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>

      {/* Footer */}
      <footer className="h-10 bg-[#0f172a] text-white flex items-center justify-between px-6 text-[10px] uppercase tracking-widest shrink-0">
        <div className="flex flex-col">
          <span>DATA SOURCE: YAHOO FINANCE API</span>
          <span className="text-[8px] opacity-70">Dan@微信公众号【TraderX-Flow】</span>
        </div>
        <div className="text-center font-bold text-amber-400">
          Not Investment and Trading Advice!
        </div>
        <div className="flex flex-col items-end">
          <div className="flex gap-5">
            <span>CALC ENGINE: V2.4.0</span>
            <span>STATUS: STABLE</span>
          </div>
          <span className="text-[8px] opacity-70">TIMESTAMP: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')} UTC</span>
        </div>
      </footer>
    </div>
  );

  function prepareChartData(recentPrices: number[], histPrices: number[]) {
    const normalize = (prices: number[]) => {
      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const std = Math.sqrt(prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length);
      return prices.map(v => (v - mean) / (std || 1));
    };

    const normRecent = normalize(recentPrices);
    const normHist = normalize(histPrices);

    return normRecent.map((p, i) => ({
      index: i,
      recent: p,
      historical: normHist[i],
    }));
  }

  function prepareForwardData(seg: Segment | undefined) {
    if (!seg) return [];
    const data = [];
    for (let i = 0; i < seg.prices.length; i++) {
      data.push({ 
        index: i, 
        match: seg.prices[i], 
        forward: i === seg.prices.length - 1 ? seg.prices[i] : null 
      });
    }
    if (seg.forwardPrices) {
      for (let i = 0; i < seg.forwardPrices.length; i++) {
        data.push({ 
          index: seg.prices.length + i, 
          match: null, 
          forward: seg.forwardPrices[i] 
        });
      }
    }
    return data;
  }
}

function PatternMiniChart({ recent, historical, color }: { recent: number[], historical: number[], color: string }) {
  const normalize = (prices: number[]) => {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const std = Math.sqrt(prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length);
    return prices.map(v => (v - mean) / (std || 1));
  };

  const normRecent = normalize(recent);
  const normHist = normalize(historical);

  const data = normRecent.map((p, i) => ({
    index: i,
    recent: p,
    historical: normHist[i],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="index" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Line 
          type="monotone" 
          dataKey="recent" 
          stroke="var(--primary)" 
          strokeWidth={1.5} 
          dot={false} 
          name="Current"
        />
        <Line 
          type="monotone" 
          dataKey="historical" 
          stroke={color} 
          strokeWidth={1.5} 
          strokeDasharray="3 3" 
          dot={false} 
          name="Historical"
          opacity={0.7}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
