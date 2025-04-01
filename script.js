// --- Configuration ---
const apiKey = "cvi1cc9r01qks9q7knqgcvi1cc9r01qks9q7knr0"; // <<< USER PROVIDED KEY (INSECURE!)
const finnhubBaseUrl = "https://finnhub.io/api/v1";
const DEFAULT_RISK_FREE_RATE = 0.04;
const DEFAULT_EQUITY_RISK_PREMIUM = 0.055;
const DEFAULT_TERMINAL_GROWTH_RATE = 0.03;
const NEW_WATCHLIST_OPTION_VALUE = "--new--";
const DEFAULT_WATCHLIST_NAME = "My Watchlist";

// --- DOM Elements ---
const tickerInput = document.getElementById('tickerInput');
const addButton = document.getElementById('addButton');
const watchlistEl = document.getElementById('watchlist');
const statusEl = document.getElementById('status');
const watchlistSelector = document.getElementById('watchlist-selector');
const renameBtn = document.getElementById('rename-list-btn');
const deleteBtn = document.getElementById('delete-list-btn');

// --- State ---
let allWatchlists = {}; // { "List Name": ["AAPL", "MSFT"], ... }
let activeWatchlistName = "";
let currentQuoteData = {};

// --- Utility Functions ---
const setStatus = (message, type = 'info') => {
  console.log(`[Status Update (${type})]: ${message}`);
  statusEl.textContent = message;
  statusEl.className = '';
  if (message) {
    statusEl.classList.add(`status-${type}`);
  }
  if (type === 'info' || type === 'success') {
    setTimeout(() => {
      if ((statusEl.classList.contains('status-info') || statusEl.classList.contains('status-success')) && statusEl.textContent === message) {
        setStatus('');
      }
    }, 4000);
  }
};

const formatNumber = (num) => {
  if (num === null || num === undefined || num === '' || isNaN(num)) return 'N/A';
  let number = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num;
  if (isNaN(number)) return 'N/A';
  if (Math.abs(number) >= 1e12) return (number / 1e12).toFixed(2) + 'T';
  if (Math.abs(number) >= 1e9) return (number / 1e9).toFixed(2) + 'B';
  if (Math.abs(number) >= 1e6) return (number / 1e6).toFixed(2) + 'M';
  return number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: (Math.abs(number) < 1 && number !== 0) ? 2 : 0 });
};

const formatPrice = (num) => {
  if (typeof num !== 'number' || isNaN(num)) return 'N/A';
  return `$${num.toFixed(2)}`;
};

const formatRatio = (num) => {
  if (typeof num !== 'number' || isNaN(num)) return 'N/A';
  return num.toFixed(2);
};

const formatPercent = (num) => {
  if (typeof num !== 'number' || isNaN(num)) return 'N/A';
  return num.toFixed(1) + '%';
};

const finnhubFetch = async (endpoint) => {
  const fullEndpoint = `${endpoint}&token=${apiKey}`;
  console.log(`[API Request] Fetching: ${fullEndpoint.replace(apiKey, '***KEY***')}`);
  if (!apiKey || apiKey.length < 10 || !apiKey.startsWith("cvi")) {
    throw new Error("API Key missing or appears invalid.");
  }
  try {
    const response = await fetch(`${finnhubBaseUrl}${fullEndpoint}`);
    const responseClone = response.clone();
    if (!response.ok) {
      let errorDetails = `API Error ${response.status} ${response.statusText}.`;
      try {
        const errorData = await response.json();
        console.error("[API Error] Response Body:", errorData);
        errorDetails += ` Details: ${JSON.stringify(errorData)}`;
      } catch (e) {
        try {
          const errorText = await responseClone.text();
          console.error("[API Error] Response Text:", errorText);
          errorDetails += ` Response: ${errorText.substring(0, 200)}`;
        } catch (e2) {
          errorDetails += " (Could not parse error body)";
        }
      }
      throw new Error(errorDetails);
    }
    const data = await response.json();
    const logData = JSON.stringify(data);
    console.log(`[API Response] Success for ${endpoint.split('?')[0]}:`, logData.length > 500 ? logData.substring(0, 500) + '... (truncated)' : data);
    return data;
  } catch (error) {
    console.error(`[API Request Failed] Endpoint: ${endpoint.split('?')[0]} Error: ${error.message}`);
    throw error;
  }
};

// --- App Data Persistence ---
const saveAppData = () => {
  try {
    localStorage.setItem('stockApp_allWatchlists_v1', JSON.stringify(allWatchlists));
    localStorage.setItem('stockApp_activeWatchlistName_v1', activeWatchlistName);
    console.log("App data saved.");
  } catch (e) {
    console.error("LS Save Error:", e);
    setStatus("Could not save app state.", "error");
  }
};

const loadAppData = () => {
  try {
    const storedWatchlists = localStorage.getItem('stockApp_allWatchlists_v1');
    const storedActiveName = localStorage.getItem('stockApp_activeWatchlistName_v1');
    let loadedData = false;

    if (storedWatchlists) {
      allWatchlists = JSON.parse(storedWatchlists);
      if (typeof allWatchlists !== 'object' || allWatchlists === null || Object.keys(allWatchlists).length === 0) {
        console.warn("Stored watchlists format invalid or empty, resetting.");
        allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
      } else {
        loadedData = true;
      }
    } else {
      allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
    }

    if (loadedData && storedActiveName && allWatchlists[storedActiveName]) {
      activeWatchlistName = storedActiveName;
    } else if (Object.keys(allWatchlists).length > 0) {
      activeWatchlistName = Object.keys(allWatchlists)[0];
    } else {
      allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
      activeWatchlistName = DEFAULT_WATCHLIST_NAME;
    }
    console.log("App data loaded. Active list:", activeWatchlistName);

    if (!allWatchlists[activeWatchlistName]) {
      console.warn(`Active list "${activeWatchlistName}" not found after load, switching to first available.`);
      activeWatchlistName = Object.keys(allWatchlists)[0] || DEFAULT_WATCHLIST_NAME;
      if (!allWatchlists[activeWatchlistName]) {
        allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
        activeWatchlistName = DEFAULT_WATCHLIST_NAME;
      }
      saveAppData();
    }
  } catch (e) {
    console.error("LS Load Error:", e);
    allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
    activeWatchlistName = DEFAULT_WATCHLIST_NAME;
    setStatus("Could not load previous state, reset to default.", "error");
  }
};

// --- API Fetching (Combined for basic data) ---
const fetchBasicData = async (symbol, liElement) => {
  const priceEl = liElement.querySelector('.stock-price');
  const nameEl = liElement.querySelector('.stock-name');
  if (!priceEl || !nameEl) return;
  priceEl.textContent = '(--)';
  nameEl.textContent = '(Loading...)';
  currentQuoteData[symbol] = {};
  try {
    const [quote, profile] = await Promise.all([
      finnhubFetch(`/quote?symbol=${symbol}`),
      finnhubFetch(`/stock/profile2?symbol=${symbol}`)
    ]);
    currentQuoteData[symbol].price = quote?.c;
    currentQuoteData[symbol].marketCap = profile?.marketCapitalization * 1e6;
    currentQuoteData[symbol].sharesOutstanding = profile?.shareOutstanding * 1e6;
    priceEl.textContent = formatPrice(currentQuoteData[symbol].price);
    nameEl.textContent = profile?.name || '(Name N/A)';
    if (!profile?.ticker || profile.ticker.toUpperCase() !== symbol)
      console.warn(`Profile mismatch? ${symbol}`, profile);
  } catch (error) {
    if (!priceEl.textContent || priceEl.textContent === '(--)')
      priceEl.textContent = 'Error';
    if (!nameEl.textContent || nameEl.textContent === '(Loading...)')
      nameEl.textContent = '(Error)';
    setStatus(`Basic Data Err (${symbol}): ${error.message.substring(0, 100)}`, "error");
  }
};

// --- Value Finder (Corrected Path + Cleaned Logs - from v9) ---
const findValue = (reportItem, conceptKeys) => {
  const actualReportData = reportItem?.report;
  if (!actualReportData || typeof actualReportData !== 'object') {
    return null;
  }
  const reportSections = { ic: actualReportData.ic, bs: actualReportData.bs, cf: actualReportData.cf };
  for (const key of conceptKeys) {
    const targetKey = key.trim();
    for (const sectionName in reportSections) {
      const section = reportSections[sectionName];
      if (Array.isArray(section)) {
        const item = section.find(el => el?.concept?.trim() === targetKey);
        if (item) {
          if (item.value !== undefined && item.value !== null && (typeof item.value === 'number' || typeof item.value === 'string')) {
            let value = typeof item.value === 'string' ? parseFloat(item.value.replace(/,/g, '')) : item.value;
            if (!isNaN(value)) {
              return value;
            }
          }
          break;
        }
      }
    }
    if (actualReportData[targetKey] !== undefined && actualReportData[targetKey] !== null &&
        (typeof actualReportData[targetKey] === 'number' || typeof actualReportData[targetKey] === 'string')) {
      let value = typeof actualReportData[targetKey] === 'string' ? parseFloat(actualReportData[targetKey].replace(/,/g, '')) : actualReportData[targetKey];
      if (!isNaN(value)) {
        return value;
      }
    }
  }
  return null;
};

// --- CAGR Calculation ---
const calculateCAGR = (startVal, endVal, years) => {
  if (startVal === null || endVal === null || typeof startVal !== 'number' || typeof endVal !== 'number' || years <= 0 || startVal === 0 || (endVal < 0 && startVal > 0 && !String(startVal).includes('%')))
    return null;
  const cagr = (Math.pow(endVal / startVal, 1 / years)) - 1;
  return cagr * 100;
};

// --- Get Color Class for Percentage (Refined Logic for Debt Growth - v26) ---
const getPercentageColorClass = (value, metricType = 'good', isGrowthRate = false) => {
  if (value === null || isNaN(value)) return '';
  if (metricType === 'good') {
    if (value <= 0) return 'bg-red';
    if (value <= 5) return 'bg-light-red';
    if (value <= 15) return 'bg-yellow';
    if (value <= 25) return 'bg-light-green';
    return 'bg-green';
  } else if (metricType === 'bad') {
    if (isGrowthRate) {
      if (value <= 0) return 'bg-green';
      if (value <= 5) return 'bg-light-green';
      if (value <= 10) return 'bg-yellow';
      if (value <= 15) return 'bg-light-red';
      return 'bg-red';
    } else {
      if (value <= 30) return 'bg-green';
      if (value <= 45) return 'bg-light-green';
      if (value <= 60) return 'bg-yellow';
      if (value <= 75) return 'bg-light-red';
      return 'bg-red';
    }
  }
  return '';
};

// --- DCF Calculation (Reads inputs, Saves to LS per list/symbol) ---
const calculateDCF = (symbol) => {
  console.log(`[calculateDCF] Triggered for ${symbol} in list ${activeWatchlistName}`);
  const valuationSection = document.querySelector(`#watchlist li[data-symbol="${symbol}"] #valuation-section`);
  if (!valuationSection) {
    console.error("Valuation section not found for DCF calc.");
    return;
  }
  const outputEl = valuationSection.querySelector('#dcf-output');
  const comparisonEl = valuationSection.querySelector('#dcf-comparison');
  outputEl.innerHTML = '<p class="status-loading">Calculating...</p>';
  comparisonEl.textContent = '';
  comparisonEl.className = '';
  try {
    const fcf0Input = valuationSection.querySelector(`#dcf-fcf0-${symbol}`);
    const grInput = valuationSection.querySelector(`#dcf-gr-${symbol}`);
    const nInput = valuationSection.querySelector(`#dcf-n-${symbol}`);
    const rInput = valuationSection.querySelector(`#dcf-r-${symbol}`);
    const gInput = valuationSection.querySelector(`#dcf-g-${symbol}`);
    const fcf0 = parseFloat(fcf0Input.value);
    const gr = parseFloat(grInput.value) / 100;
    const n = parseInt(nInput.value, 10);
    const r = parseFloat(rInput.value) / 100;
    const g = parseFloat(gInput.value) / 100;
    const storagePrefix = `dcf-${activeWatchlistName}-${symbol}`;
    localStorage.setItem(`${storagePrefix}-fcf0`, fcf0Input.value);
    localStorage.setItem(`${storagePrefix}-gr`, grInput.value);
    localStorage.setItem(`${storagePrefix}-n`, nInput.value);
    localStorage.setItem(`${storagePrefix}-r`, rInput.value);
    localStorage.setItem(`${storagePrefix}-g`, gInput.value);
    console.log(`[DCF] Saved inputs to localStorage for ${symbol} in list ${activeWatchlistName}`);
    if (isNaN(fcf0) || isNaN(gr) || isNaN(n) || isNaN(r) || isNaN(g)) {
      throw new Error("Invalid input.");
    }
    if (n <= 0 || n > 20) {
      throw new Error("Years (n) must be 1-20.");
    }
    if (r <= g) {
      throw new Error("R must be > g.");
    }
    if (r <= 0) {
      throw new Error("R must be positive.");
    }
    let pvSum = 0;
    let currentFCF = fcf0;
    for (let year = 1; year <= n; year++) {
      currentFCF *= (1 + gr);
      pvSum += currentFCF / Math.pow(1 + r, year);
    }
    const fcfNplus1 = currentFCF * (1 + g);
    const terminalValue = fcfNplus1 / (r - g);
    const pvTerminalValue = terminalValue / Math.pow(1 + r, n);
    const totalIntrinsicValue = pvSum + pvTerminalValue;
    const sharesOutstanding = currentQuoteData[symbol]?.sharesOutstanding;
    let intrinsicValuePerShare = (sharesOutstanding && sharesOutstanding > 0) ? totalIntrinsicValue / sharesOutstanding : null;
    outputEl.innerHTML = ` <p><span>Total Intrinsic Value:</span> ${formatNumber(totalIntrinsicValue)}</p> <p><span>Intrinsic Value / Share:</span> ${intrinsicValuePerShare !== null ? formatPrice(intrinsicValuePerShare) : 'N/A (Missing Shares Data)'}</p> `;
    const marketPrice = currentQuoteData[symbol]?.price;
    if (intrinsicValuePerShare !== null && marketPrice !== null) {
      const difference = ((intrinsicValuePerShare - marketPrice) / marketPrice) * 100;
      if (intrinsicValuePerShare > marketPrice) {
        comparisonEl.textContent = `Potentially Undervalued by ${formatPercent(difference)}`;
        comparisonEl.className = 'value-undervalued';
      } else {
        comparisonEl.textContent = `Potentially Overvalued by ${formatPercent(Math.abs(difference))}`;
        comparisonEl.className = 'value-overvalued';
      }
    }
  } catch (error) {
    console.error(`[calculateDCF Error] for ${symbol}:`, error);
    outputEl.innerHTML = `<p class="status-error">Error: ${error.message}</p>`;
    comparisonEl.textContent = '';
    comparisonEl.className = '';
  }
};

// --- Reset DCF Defaults (Uses list/symbol prefix for LS) ---
const resetDCFDefaults = (symbol) => {
  console.log(`[resetDCFDefaults] Triggered for ${symbol} in list ${activeWatchlistName}`);
  const valuationSection = document.querySelector(`#watchlist li[data-symbol="${symbol}"] #valuation-section`);
  if (!valuationSection) {
    console.error("Valuation section not found for reset.");
    return;
  }
  const inputs = {
    fcf0: valuationSection.querySelector(`#dcf-fcf0-${symbol}`),
    gr: valuationSection.querySelector(`#dcf-gr-${symbol}`),
    n: valuationSection.querySelector(`#dcf-n-${symbol}`),
    r: valuationSection.querySelector(`#dcf-r-${symbol}`),
    g: valuationSection.querySelector(`#dcf-g-${symbol}`)
  };
  const storagePrefix = `dcf-${activeWatchlistName}-${symbol}`;
  let defaultsRestored = false;
  for (const key in inputs) {
    if (inputs[key] && inputs[key].dataset.defaultValue !== undefined) {
      inputs[key].value = inputs[key].dataset.defaultValue;
      localStorage.removeItem(`${storagePrefix}-${key}`);
      defaultsRestored = true;
    } else {
      console.warn(`Could not find input or default value for ${key}`);
    }
  }
  if (defaultsRestored) {
    setStatus(`DCF inputs reset to defaults for ${symbol}.`, 'info');
    valuationSection.querySelector('#dcf-output').innerHTML = '';
    valuationSection.querySelector('#dcf-comparison').textContent = '';
    valuationSection.querySelector('#dcf-comparison').className = '';
  } else {
    setStatus(`Could not reset defaults for ${symbol}.`, 'error');
  }
  console.log(`[resetDCFDefaults] Cleared localStorage overrides for ${symbol} in list ${activeWatchlistName}`);
};

// --- fetchFinancials (v31 - Handles Persistent Inputs) ---
const fetchFinancials = async (symbol, detailsContainer) => {
  console.log(`[fetchFinancials] Starting for ${symbol}`);
  detailsContainer.innerHTML = '<p class="status-loading">Loading details...</p>';
  detailsContainer.style.display = 'block';
  const results = { current: {}, currentValuation: {}, historical: {}, growth: {}, dcfDefaults: {} };
  const metricTypeMap = { 'Net Earn. Marg.(%)': 'good', 'Debt/Asset Ratio (%)': 'bad', 'ROA (%)': 'good', 'Revenue': 'good', 'EBIT': 'good', 'Net Earnings': 'good', 'Operating Cash Flow': 'good', 'Free Cash Flow': 'good', 'Total Assets': 'good', 'Total Liabilities': 'bad', 'Shareholders Equity': 'good' };
  try {
    const [financialsData, metricsData] = await Promise.all([
      finnhubFetch(`/stock/financials-reported?symbol=${symbol}&freq=annual`),
      finnhubFetch(`/stock/metric?symbol=${symbol}&metric=all`)
    ]).catch(err => { throw new Error(`Failed initial data fetch: ${err.message}`); });
    results.current.price = currentQuoteData[symbol]?.price;
    results.current.marketCap = currentQuoteData[symbol]?.marketCap;
    results.current.beta = metricsData?.metric?.beta;
    if (!financialsData?.data?.length) throw new Error("No annual financial data array.");
    const sortedData = [...financialsData.data].sort((a, b) => b.year - a.year);
    const latestReportItem = sortedData[0];
    if (!latestReportItem?.year) throw new Error("Could not identify latest report year.");
    const latestYear = latestReportItem.year;
    const displayOffsets = [0, -1, -2, -5, -10];
    const historicalDates = {};
    const priceFetchPromises = [];
    displayOffsets.forEach(offset => {
      const targetYear = latestYear + offset;
      const reportItem = sortedData.find(item => item.year === targetYear);
      if (reportItem?.endDate) {
        try {
          const endDate = new Date(reportItem.endDate + "T00:00:00Z");
          if (!isNaN(endDate)) {
            const unixEnd = Math.floor(endDate.getTime() / 1000);
            historicalDates[offset] = { year: targetYear, unixEnd: unixEnd };
            if (offset !== 0) {
              const unixStart = unixEnd - 86400;
              const unixDayAfter = unixEnd + 86400;
              priceFetchPromises.push(
                finnhubFetch(`/stock/candle?symbol=${symbol}&resolution=D&from=${unixStart}&to=${unixDayAfter}`)
                  .then(candleData => ({ offset, candleData }))
                  .catch(err => {
                    console.warn(`Candle fetch failed offset ${offset}: ${err.message}`);
                    return { offset, candleData: null };
                  })
              );
            }
          } else {
            console.warn(`Invalid endDate offset ${offset}: ${reportItem.endDate}`);
          }
        } catch(dateErr) {
          console.warn(`Error parsing endDate offset ${offset}: ${dateErr.message}`);
        }
      }
    });
    const historicalCandleResults = await Promise.all(priceFetchPromises);
    const historicalPrices = {};
    historicalCandleResults.forEach(({ offset, candleData }) => {
      if (candleData?.c?.length > 0) {
        let closestPrice = null;
        let minDiff = Infinity;
        const targetTimestamp = historicalDates[offset]?.unixEnd;
        if (targetTimestamp) {
          for (let i = 0; i < candleData.t.length; i++) {
            const diff = Math.abs(candleData.t[i] - targetTimestamp);
            if (diff < minDiff) {
              minDiff = diff;
              closestPrice = candleData.c[i];
            }
          }
          if (minDiff < 86400 * 4) {
            historicalPrices[offset] = closestPrice;
          } else {
            historicalPrices[offset] = null;
          }
        }
      } else {
        historicalPrices[offset] = null;
      }
    });
    historicalPrices[0] = results.current.price;
    const metricDefinitions = {
      'Revenue': ['us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap_Revenues', 'us-gaap_SalesRevenueNet', 'Revenues', 'SalesRevenueNet', 'TotalRevenues', 'revenue'],
      'EBIT': ['us-gaap_OperatingIncomeLoss', 'OperatingIncomeLoss'],
      'Net Earnings': ['us-gaap_NetIncomeLoss', 'us-gaap_ProfitLoss', 'NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic', 'ConsolidatedNetIncomeLoss', 'NetIncomeLossAttributableToParent', 'netIncome'],
      'Operating Cash Flow': ['us-gaap_NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
      'Capital Expenditures': ['us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', 'us-gaap_PurchaseOfPropertyPlantAndEquipment'],
      'Total Assets': ['us-gaap_Assets', 'Assets', 'totalAssets'],
      'Total Liabilities': ['us-gaap_Liabilities', 'Liabilities', 'totalLiabilities'],
      'Shareholders Equity': ['us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'us-gaap_StockholdersEquity', 'us-gaap_EquityAttributableToParent', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity', 'TotalEquity', 'totalStockholdersEquity', 'EquityAttributableToParent']
    };
    const historicalFundamentals = {};
    const allOffsetsNeeded = Array.from(new Set([0, -1, -2, -3, -5, -6, -10, -11])).sort((a, b) => b - a);
    Object.keys(metricDefinitions).forEach(metricName => {
      historicalFundamentals[metricName] = {};
      allOffsetsNeeded.forEach(offset => {
        const targetYear = latestYear + offset;
        const reportItemForYear = sortedData.find(item => item.year === targetYear);
        historicalFundamentals[metricName][offset] = reportItemForYear ? findValue(reportItemForYear, metricDefinitions[metricName]) : null;
      });
    });
    results.historical['Revenue'] = historicalFundamentals['Revenue'];
    results.historical['EBIT'] = historicalFundamentals['EBIT'];
    results.historical['Net Earnings'] = historicalFundamentals['Net Earnings'];
    results.historical['Net Earn. Marg.(%)'] = {};
    results.historical['Operating Cash Flow'] = historicalFundamentals['Operating Cash Flow'];
    results.historical['Free Cash Flow'] = {};
    results.historical['Total Assets'] = historicalFundamentals['Total Assets'];
    results.historical['Total Liabilities'] = historicalFundamentals['Total Liabilities'];
    results.historical['Shareholders Equity'] = historicalFundamentals['Shareholders Equity'];
    results.historical['Debt/Asset Ratio (%)'] = {};
    results.historical['ROA (%)'] = {};
    const tempHistoricalPE = {};
    const tempHistoricalPS = {};
    const tempHistoricalPB = {};
    const tempHistoricalPFCF = {};
    results.historical['INTERNAL_Market Cap'] = {};
    const currentShares = currentQuoteData[symbol]?.sharesOutstanding;
    if (!currentShares) console.warn("Missing shares data...");
    displayOffsets.forEach(offset => {
      results.historical['INTERNAL_Market Cap'][offset] = (currentShares && historicalPrices[offset] != null) ? historicalPrices[offset] * currentShares : null;
      const marketCapN = results.historical['INTERNAL_Market Cap'][offset];
      const revenueN = historicalFundamentals['Revenue']?.[offset];
      const netIncomeN = historicalFundamentals['Net Earnings']?.[offset];
      const ocfN = historicalFundamentals['Operating Cash Flow']?.[offset];
      const capexN = historicalFundamentals['Capital Expenditures']?.[offset];
      const assetsN = historicalFundamentals['Total Assets']?.[offset];
      const assetsNminus1 = historicalFundamentals['Total Assets']?.[offset - 1];
      const liabilitiesN = historicalFundamentals['Total Liabilities']?.[offset];
      const equityN = historicalFundamentals['Shareholders Equity']?.[offset];
      // Fixed FCF calculation: subtract capital expenditures instead of adding them.
      if (ocfN != null && capexN != null) {
        results.historical['Free Cash Flow'][offset] = ocfN - capexN;
      } else if (ocfN != null) {
        results.historical['Free Cash Flow'][offset] = ocfN;
      } else {
        results.historical['Free Cash Flow'][offset] = null;
      }
      results.historical['Net Earn. Marg.(%)'][offset] = (netIncomeN != null && revenueN != null && revenueN !== 0) ? (netIncomeN / revenueN) * 100 : null;
      results.historical['ROA (%)'][offset] = (netIncomeN != null && assetsN != null && assetsNminus1 != null) ? (((assetsN + assetsNminus1) / 2) !== 0 ? (netIncomeN / ((assetsN + assetsNminus1) / 2)) * 100 : null) : null;
      results.historical['Debt/Asset Ratio (%)'][offset] = (liabilitiesN != null && assetsN != null && assetsN !== 0) ? (liabilitiesN / assetsN) * 100 : null;
      tempHistoricalPE[offset] = (marketCapN != null && netIncomeN != null && netIncomeN > 0) ? (marketCapN / netIncomeN) : null;
      tempHistoricalPS[offset] = (marketCapN != null && revenueN != null && revenueN !== 0) ? (marketCapN / revenueN) : null;
      tempHistoricalPB[offset] = (marketCapN != null && equityN != null && equityN > 0) ? (marketCapN / equityN) : null;
      tempHistoricalPFCF[offset] = (marketCapN != null && results.historical['Free Cash Flow'][offset] != null && results.historical['Free Cash Flow'][offset] !== 0) ? (marketCapN / results.historical['Free Cash Flow'][offset]) : null;
    });
    results.currentValuation.pe = tempHistoricalPE[0];
    results.currentValuation.ps = tempHistoricalPS[0];
    results.currentValuation.pb = tempHistoricalPB[0];
    results.currentValuation.pfcf = tempHistoricalPFCF[0];
    const growthMetrics = ['Revenue', 'EBIT', 'Net Earnings', 'Net Earn. Marg.(%)', 'Operating Cash Flow', 'Free Cash Flow', 'Total Assets', 'Total Liabilities', 'Shareholders Equity', 'Debt/Asset Ratio (%)', 'ROA (%)'];
    const growthYearsMap = { '1Y': 1, '2Y': 2, '5Y': 5, '10Y': 10 };
    growthMetrics.forEach(metric => {
      results.growth[metric] = {};
      const currentVal = results.historical[metric]?.[0];
      Object.entries(growthYearsMap).forEach(([periodLabel, years]) => {
        const startVal = results.historical[metric]?.[-years];
        results.growth[metric][periodLabel] = calculateCAGR(startVal, currentVal, years);
      });
    });
    const fcfHistory = results.historical['Free Cash Flow'];
    const fcfT0 = fcfHistory?.[0];
    const fcfT2 = fcfHistory?.[-2];
    const fcfT5 = fcfHistory?.[-5];
    const fcfT10 = fcfHistory?.[-10];
    const cagr2Y = calculateCAGR(fcfT2, fcfT0, 2);
    const cagr5Y = calculateCAGR(fcfT5, fcfT0, 5);
    const cagr10Y = calculateCAGR(fcfT10, fcfT0, 10);
    let defaultGR = null;
    const weights = { y2: 0.5, y5: 0.3, y10: 0.2 };
    let totalWeight = 0;
    let weightedSum = 0;
    if (cagr2Y !== null) {
      weightedSum += weights.y2 * cagr2Y;
      totalWeight += weights.y2;
    }
    if (cagr5Y !== null) {
      weightedSum += weights.y5 * cagr5Y;
      totalWeight += weights.y5;
    }
    if (cagr10Y !== null) {
      weightedSum += weights.y10 * cagr10Y;
      totalWeight += weights.y10;
    }
    if (totalWeight > 0) {
      defaultGR = weightedSum / totalWeight;
    }
    defaultGR = (defaultGR === null) ? 5.0 : Math.max(0, Math.min(defaultGR, 30.0));
    results.dcfDefaults.gr = defaultGR / 100;
    let defaultN = 5;
    if (cagr2Y !== null && cagr5Y !== null) {
      if (cagr2Y < (cagr5Y * 0.8)) defaultN = 3;
      else if (cagr2Y >= cagr5Y) defaultN = 7;
    } else if (cagr2Y !== null && cagr2Y < 5) {
      defaultN = 3;
    }
    results.dcfDefaults.n = defaultN;
    let defaultR = 0.09;
    const beta = results.current.beta;
    if (beta !== null && !isNaN(beta)) {
      defaultR = DEFAULT_RISK_FREE_RATE + beta * DEFAULT_EQUITY_RISK_PREMIUM;
      defaultR = Math.max(0.05, defaultR);
    }
    results.dcfDefaults.r = defaultR;
    results.dcfDefaults.g = DEFAULT_TERMINAL_GROWTH_RATE;
    results.dcfDefaults.fcf0 = fcfT0 ?? 0;
    console.log(`[DCF Defaults] Calculated:`, results.dcfDefaults);

    let todayHtml = `...`;
    let tabsHtml = `...`;
    let snapshotContentHtml = `...`;
    let growthContentHtml = `...`;
    let dcfContentHtml = `...`;
    todayHtml = `<div class="today-section">
      <p><span>Price:</span> ${formatPrice(results.current.price)}</p>
      <p><span>Market Cap:</span> ${formatNumber(results.current.marketCap)}</p>
      <p><span>Beta:</span> ${formatRatio(results.current.beta)}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 6px 0;">
      <p><span>P/E Ratio:</span> ${formatRatio(results.currentValuation.pe)}</p>
      <p><span>P/S Ratio:</span> ${formatRatio(results.currentValuation.ps)}</p>
      <p><span>P/B Ratio:</span> ${formatRatio(results.currentValuation.pb)}</p>
      <p><span>P/FCF Ratio:</span> ${formatRatio(results.currentValuation.pfcf)}</p>
    </div>`;
    tabsHtml = `<div class="tab-buttons">
      <button class="tab-button active" onclick="showTab(this, '${symbol}-snapshot')">Snapshot</button>
      <button class="tab-button" onclick="showTab(this, '${symbol}-growth')">Growth</button>
      <button class="tab-button" onclick="showTab(this, '${symbol}-dcf')">DCF</button>
    </div>`;
    snapshotContentHtml = `<div id="${symbol}-snapshot" class="tab-content active">
      <h4>Financial Snapshot (Annual)</h4>
      <table class="details-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>(T=${latestYear})</th>
            <th>T-1</th>
            <th>T-2</th>
            <th>T-5</th>
            <th>T-10</th>
          </tr>
        </thead>
        <tbody>`;
    const displayOrderSnapshot = ['Revenue', 'EBIT', 'Net Earnings', 'Net Earn. Marg.(%)', 'Operating Cash Flow', 'Free Cash Flow', 'Total Assets', 'Total Liabilities', 'Shareholders Equity', 'Debt/Asset Ratio (%)', 'ROA (%)'];
    displayOrderSnapshot.forEach(metricName => {
      snapshotContentHtml += `<tr><td>${metricName}</td>`;
      displayOffsets.forEach(offset => {
        let displayValue = 'N/A';
        let colorClass = '';
        const value = results.historical[metricName]?.[offset];
        if (value !== undefined && value !== null) {
          if (metricName.includes('%')) {
            const type = metricTypeMap[metricName] || 'good';
            colorClass = getPercentageColorClass(value, type, false);
            displayValue = formatPercent(value);
          } else {
            displayValue = formatNumber(value);
          }
        }
        snapshotContentHtml += `<td class="${colorClass}">${displayValue}</td>`;
      });
      snapshotContentHtml += `</tr>`;
    });
    snapshotContentHtml += `</tbody></table></div>`;
    growthContentHtml = `<div id="${symbol}-growth" class="tab-content">
      <h4>Annualized Growth Rates (CAGR %)</h4>
      <table class="details-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>1-Year</th>
            <th>2-Years</th>
            <th>5-Years</th>
            <th>10-Years</th>
          </tr>
        </thead>
        <tbody>`;
    const displayOrderGrowth = ['Revenue', 'EBIT', 'Net Earnings', 'Net Earn. Marg.(%)', 'Operating Cash Flow', 'Free Cash Flow', 'Total Assets', 'Total Liabilities', 'Shareholders Equity', 'Debt/Asset Ratio (%)', 'ROA (%)'];
    displayOrderGrowth.forEach(metricName => {
      growthContentHtml += `<tr><td>${metricName}</td>`;
      Object.entries(growthYearsMap).forEach(([periodLabel, years]) => {
        let displayValue = 'N/A';
        let colorClass = '';
        const value = results.growth[metricName]?.[periodLabel];
        if (value !== undefined && value !== null) {
          const type = metricTypeMap[metricName] || 'good';
          colorClass = getPercentageColorClass(value, type, true);
          displayValue = formatPercent(value);
        }
        growthContentHtml += `<td class="${colorClass}">${displayValue}</td>`;
      });
      growthContentHtml += `</tr>`;
    });
    growthContentHtml += `</tbody></table></div>`;
    const storagePrefix = `dcf-${activeWatchlistName}-${symbol}`;
    const savedFcf0 = localStorage.getItem(`${storagePrefix}-fcf0`) ?? results.dcfDefaults.fcf0.toFixed(0);
    const savedGr = localStorage.getItem(`${storagePrefix}-gr`) ?? (results.dcfDefaults.gr * 100).toFixed(1);
    const savedN = localStorage.getItem(`${storagePrefix}-n`) ?? results.dcfDefaults.n;
    const savedR = localStorage.getItem(`${storagePrefix}-r`) ?? (results.dcfDefaults.r * 100).toFixed(1);
    const savedG = localStorage.getItem(`${storagePrefix}-g`) ?? (results.dcfDefaults.g * 100).toFixed(1);
    dcfContentHtml = `<div id="${symbol}-dcf" class="tab-content">
      <div id="valuation-section">
        <h4>FCF Discounted Cash Flow (DCF) Valuation</h4>
        <div class="valuation-inputs">
          <div>
            <label for="dcf-fcf0-${symbol}">Latest FCF (FCF₀)</label>
            <input type="number" id="dcf-fcf0-${symbol}" step="any" value="${savedFcf0}" data-default-value="${results.dcfDefaults.fcf0.toFixed(0)}">
          </div>
          <div>
            <label for="dcf-gr-${symbol}">Growth Rate (GR %)</label>
            <input type="number" id="dcf-gr-${symbol}" step="0.1" value="${savedGr}" data-default-value="${(results.dcfDefaults.gr * 100).toFixed(1)}">
          </div>
          <div>
            <label for="dcf-n-${symbol}">High-Growth Years (n)</label>
            <input type="number" id="dcf-n-${symbol}" step="1" min="1" max="20" value="${savedN}" data-default-value="${results.dcfDefaults.n}">
          </div>
          <div>
            <label for="dcf-r-${symbol}">Discount Rate (R %)</label>
            <input type="number" id="dcf-r-${symbol}" step="0.1" value="${savedR}" data-default-value="${(results.dcfDefaults.r * 100).toFixed(1)}">
          </div>
          <div>
            <label for="dcf-g-${symbol}">Terminal Growth (g %)</label>
            <input type="number" id="dcf-g-${symbol}" step="0.1" value="${savedG}" data-default-value="${(results.dcfDefaults.g * 100).toFixed(1)}">
          </div>
          <div class="valuation-buttons">
            <button id="calculate-dcf-${symbol}" onclick="calculateDCF('${symbol}')">Calculate</button>
            <button id="reset-dcf-${symbol}" onclick="resetDCFDefaults('${symbol}')">Reset</button>
          </div>
        </div>
        <div id="dcf-output"></div>
        <p id="dcf-comparison" style="text-align: center; margin-top: 10px;"></p>
      </div>
    </div>`;
    detailsContainer.innerHTML = todayHtml + tabsHtml + snapshotContentHtml + growthContentHtml + dcfContentHtml;
    detailsContainer.innerHTML += `<p style="font-size: 0.8em; color: #666; margin-top: 15px;"><i>Note: Historical data reflects fiscal year ends. CAGR based on available start/end points. Current P/X ratios use latest fiscal year data & est. market cap. FCF = OCF - CapEx.</i></p>`;
    calculateDCF(symbol);
  } catch (error) {
    console.error(`[fetchFinancials Error] for ${symbol}:`, error);
    detailsContainer.innerHTML = `<p class="status-error">Error loading details: ${error.message}</p>`;
  }
};

// --- Show Tab Function ---
const showTab = (buttonElement, tabIdToShow) => {
  const detailsContainer = buttonElement.closest('.details-container');
  if (!detailsContainer) return;
  detailsContainer.querySelectorAll('.tab-content').forEach(content => { content.classList.remove('active'); });
  detailsContainer.querySelectorAll('.tab-button').forEach(button => { button.classList.remove('active'); });
  const contentToShow = detailsContainer.querySelector('#' + tabIdToShow);
  if (contentToShow) {
    contentToShow.classList.add('active');
  }
  buttonElement.classList.add('active');
};

// --- Watchlist Management ---
const populateWatchlistSelector = () => {
  watchlistSelector.innerHTML = '';
  const listNames = Object.keys(allWatchlists).sort();
  listNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === activeWatchlistName) {
      option.selected = true;
    }
    watchlistSelector.appendChild(option);
  });
  const newOption = document.createElement('option');
  newOption.value = NEW_WATCHLIST_OPTION_VALUE;
  newOption.textContent = "+ New Watchlist";
  watchlistSelector.appendChild(newOption);
  const canModify = listNames.length > 1;
  renameBtn.disabled = !canModify;
  deleteBtn.disabled = !canModify;
};

const handleWatchlistChange = (selectedValue) => {
  if (selectedValue === NEW_WATCHLIST_OPTION_VALUE) {
    const newListName = prompt("Enter name for the new watchlist:");
    if (newListName && newListName.trim()) {
      const trimmedName = newListName.trim();
      if (allWatchlists[trimmedName]) {
        setStatus(`Watchlist "${trimmedName}" already exists.`, 'error');
        watchlistSelector.value = activeWatchlistName;
      } else {
        allWatchlists[trimmedName] = [];
        activeWatchlistName = trimmedName;
        saveAppData();
        populateWatchlistSelector();
        renderWatchlist();
        setStatus(`Created and switched to watchlist "${trimmedName}".`, 'success');
      }
    } else {
      watchlistSelector.value = activeWatchlistName;
    }
  } else {
    if (allWatchlists[selectedValue]) {
      activeWatchlistName = selectedValue;
      saveAppData();
      renderWatchlist();
      setStatus(`Switched to watchlist "${activeWatchlistName}".`, 'info');
    } else {
      console.error(`Selected watchlist "${selectedValue}" not found.`);
      watchlistSelector.value = activeWatchlistName;
    }
  }
};

const renameCurrentList = () => {
  if (Object.keys(allWatchlists).length <= 1) {
    setStatus("Cannot rename the only existing list.", "error");
    return;
  }
  const oldName = activeWatchlistName;
  const newName = prompt(`Enter new name for watchlist "${oldName}":`, oldName);
  if (!newName || !newName.trim()) {
    setStatus("Rename cancelled or empty name provided.", "info");
    return;
  }
  const trimmedNewName = newName.trim();
  if (trimmedNewName === oldName) {
    setStatus("New name is the same as the old name.", "info");
    return;
  }
  if (allWatchlists[trimmedNewName]) {
    setStatus(`Watchlist "${trimmedNewName}" already exists. Cannot rename.`, "error");
    return;
  }
  console.log(`Renaming list "${oldName}" to "${trimmedNewName}"`);
  allWatchlists[trimmedNewName] = [...allWatchlists[oldName]];
  delete allWatchlists[oldName];
  activeWatchlistName = trimmedNewName;
  const symbolsInList = allWatchlists[trimmedNewName];
  symbolsInList.forEach(symbol => {
    ['fcf0', 'gr', 'n', 'r', 'g'].forEach(keySuffix => {
      const oldStorageKey = `dcf-${oldName}-${symbol}-${keySuffix}`;
      const newStorageKey = `dcf-${trimmedNewName}-${symbol}-${keySuffix}`;
      const value = localStorage.getItem(oldStorageKey);
      if (value !== null) {
        localStorage.setItem(newStorageKey, value);
        localStorage.removeItem(oldStorageKey);
        console.log(` Migrated LS key: ${oldStorageKey} -> ${newStorageKey}`);
      }
    });
  });
  saveAppData();
  populateWatchlistSelector();
  renderWatchlist();
  setStatus(`Renamed watchlist to "${trimmedNewName}".`, "success");
};

const deleteCurrentList = () => {
  const listNames = Object.keys(allWatchlists);
  if (listNames.length <= 1) {
    setStatus("Cannot delete the only watchlist.", "error");
    return;
  }
  const listNameToDelete = activeWatchlistName;
  if (confirm(`Are you sure you want to delete the watchlist "${listNameToDelete}"? This cannot be undone.`)) {
    console.log(`Deleting list "${listNameToDelete}"`);
    const symbolsToDelete = allWatchlists[listNameToDelete] || [];
    delete allWatchlists[listNameToDelete];
    symbolsToDelete.forEach(symbol => {
      ['fcf0', 'gr', 'n', 'r', 'g'].forEach(keySuffix => {
        localStorage.removeItem(`dcf-${listNameToDelete}-${symbol}-${keySuffix}`);
      });
    });
    console.log(`Cleared localStorage for deleted list "${listNameToDelete}"`);
    activeWatchlistName = Object.keys(allWatchlists)[0];
    saveAppData();
    populateWatchlistSelector();
    renderWatchlist();
    setStatus(`Deleted watchlist "${listNameToDelete}". Switched to "${activeWatchlistName}".`, "success");
  } else {
    setStatus("Deletion cancelled.", "info");
  }
};

// --- Watchlist Rendering & Stock Actions ---
const renderWatchlist = () => {
  console.log("[renderWatchlist] Rendering list:", activeWatchlistName);
  watchlistEl.innerHTML = '';
  currentQuoteData = {};
  const symbolsToRender = allWatchlists[activeWatchlistName] || [];
  if (symbolsToRender.length === 0) {
    watchlistEl.innerHTML = `<p>Watchlist "${activeWatchlistName}" is empty. Add stocks below.</p>`;
    populateWatchlistSelector();
    return;
  }
  populateWatchlistSelector();
  symbolsToRender.forEach(symbol => {
    const li = document.createElement('li');
    li.dataset.symbol = symbol;
    li.innerHTML = ` 
      <div class="stock-header">
        <div class="stock-info">
          <span class="stock-symbol" title="Click to toggle details">${symbol}</span>
          <span class="stock-name">(...)</span>
        </div>
        <div class="stock-price">(...)</div>
        <div class="stock-actions">
          <button class="details-button" title="Show/Hide Details">Details</button>
          <button class="remove-button" title="Remove ${symbol}">Remove</button>
        </div>
      </div>
      <div class="details-container" style="display: none;"></div>`;
    const removeBtn = li.querySelector('.remove-button');
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeStock(symbol); });
    const detailsBtn = li.querySelector('.details-button');
    const detailsContainer = li.querySelector('.details-container');
    const symbolSpan = li.querySelector('.stock-symbol');
    const toggleDetails = () => {
      console.log(`[Toggle Details] for ${symbol}`);
      if (detailsContainer.style.display === 'block') {
        detailsContainer.style.display = 'none';
      } else {
        const needsFetching = !detailsContainer.innerHTML || detailsContainer.querySelector('p') || !detailsContainer.querySelector('#valuation-section');
        if (needsFetching) {
          console.log(` -- Container empty/incomplete, fetching details...`);
          fetchFinancials(symbol, detailsContainer);
        } else {
          console.log(` -- Container has content, just displaying.`);
          detailsContainer.style.display = 'block';
        }
      }
    };
    detailsBtn.addEventListener('click', toggleDetails);
    symbolSpan.addEventListener('click', toggleDetails);
    watchlistEl.appendChild(li);
    fetchBasicData(symbol, li);
  });
};

const addStock = () => {
  const symbol = tickerInput.value.trim().toUpperCase();
  if (!symbol) {
    setStatus('Enter symbol.', "error");
    return;
  }
  if (!activeWatchlistName || !allWatchlists[activeWatchlistName]) {
    setStatus('No active watchlist selected.', "error");
    return;
  }
  const currentList = allWatchlists[activeWatchlistName];
  if (currentList.includes(symbol)) {
    setStatus(`${symbol} already in "${activeWatchlistName}".`, "info");
    return;
  }
  console.log(`Adding: ${symbol} to list ${activeWatchlistName}`);
  currentList.push(symbol);
  saveAppData();
  renderWatchlist();
  tickerInput.value = '';
  setStatus(`${symbol} added to "${activeWatchlistName}".`, "success");
};

const removeStock = (symbolToRemove) => {
  if (!activeWatchlistName || !allWatchlists[activeWatchlistName]) {
    setStatus('No active watchlist selected.', "error");
    return;
  }
  console.log(`Removing: ${symbolToRemove} from list ${activeWatchlistName}`);
  allWatchlists[activeWatchlistName] = allWatchlists[activeWatchlistName].filter(symbol => symbol !== symbolToRemove);
  saveAppData();
  renderWatchlist();
  setStatus(`${symbolToRemove} removed from "${activeWatchlistName}".`, "info");
};

// --- Hamburger Menu Functionality ---
document.addEventListener('DOMContentLoaded', () => {
  const hamburgerIcon = document.querySelector('.hamburger-icon');
  const menuDropdown = document.querySelector('.menu-dropdown');
  
  if (hamburgerIcon && menuDropdown) {
    hamburgerIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle('active');
    });
    
    // Close the menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!hamburgerIcon.contains(e.target) && !menuDropdown.contains(e.target)) {
        menuDropdown.classList.remove('active');
      }
    });
  }
  
  // Add the missing event listener for the Add Stock button
  addButton.addEventListener('click', addStock);
  
  // Handle Enter key in the ticker input field
  tickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addStock();
    }
  });

  // New function to save local data to a JSON file
  const saveLocalDataToFile = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('stockApp_') || key.startsWith('dcf-')) {
        data[key] = localStorage.getItem(key);
      }
    }
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'watchlist_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Watchlists saved to JSON file.', 'success');
  };

  // Add event listener for "Save Watchlists" clickable element in the hamburger menu
  const saveWatchlistsEl = document.getElementById('save-watchlists');
  if (saveWatchlistsEl) {
    saveWatchlistsEl.addEventListener('click', (e) => {
      e.preventDefault();
      saveLocalDataToFile();
    });
  }

  // New: Load Watchlists functionality
  const loadWatchlistsEl = document.getElementById('load-watchlists');
  if (loadWatchlistsEl) {
    loadWatchlistsEl.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.style.display = 'none';
      input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const loadedData = JSON.parse(e.target.result);
            Object.keys(loadedData).forEach(key => {
              localStorage.setItem(key, loadedData[key]);
            });
            loadAppData();
            populateWatchlistSelector();
            renderWatchlist();
            setStatus('Watchlists loaded from file.', 'success');
          } catch (error) {
            console.error('Error parsing JSON file', error);
            setStatus('Error loading watchlists from file.', 'error');
          }
        };
        reader.readAsText(file);
      });
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    });
  }
  
  console.log("DOM Loaded - Watchlist v32 (List Mgmt)");
  loadAppData();
  populateWatchlistSelector();
  renderWatchlist();
  if (!apiKey || apiKey.length < 10 || !apiKey.startsWith("cvi")) {
    setStatus("API Key missing or appears invalid in script.", "error");
  }
});
