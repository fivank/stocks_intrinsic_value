// --- Configuration ---
const apiKey = "cvi1cc9r01qks9q7knqgcvi1cc9r01qks9q7knr0"; // <<< USER PROVIDED KEY (INSECURE!)
const finnhubBaseUrl = "https://finnhub.io/api/v1";
const DEFAULT_RISK_FREE_RATE = 0.04;
const DEFAULT_EQUITY_RISK_PREMIUM = 0.055;
const DEFAULT_TERMINAL_GROWTH_RATE = 0.03;
const NEW_WATCHLIST_OPTION_VALUE = "--new--";
const DEFAULT_WATCHLIST_NAME = "My Watchlist";
const LS_PREFIX_APP = "stockApp_";
const LS_PREFIX_DCF = "dcf-";

// Firebase Configuration (REPLACE with your actual config!)
const firebaseConfig = {
  apiKey: "AIzaSyDTekgW4tR8ocKZgtpSpmMv022cyuf8Hgk", // IMPORTANT: Use your key
  authDomain: "stocksvaluation.firebaseapp.com",
  projectId: "stocksvaluation",
  storageBucket: "stocksvaluation.firebasestorage.app",
  messagingSenderId: "335697208006",
  appId: "1:335697208006:web:1a706ee57dadf590c66dc7"
};

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.error("Firebase initialization failed:", e);
  // Optionally show an error to the user that cloud features won't work
}
const fbAuth = firebase.auth();
const fbStore = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();


// --- DOM Elements ---
const tickerInput = document.getElementById('tickerInput');
const addButton = document.getElementById('addButton');
const watchlistEl = document.getElementById('watchlist');
const statusEl = document.getElementById('status');
const watchlistSelector = document.getElementById('watchlist-selector');
const renameBtn = document.getElementById('rename-list-btn');
const deleteBtn = document.getElementById('delete-list-btn');
// Hamburger Menu Elements
const hamburgerIcon = document.querySelector('.hamburger-icon');
const menuDropdown = document.querySelector('.menu-dropdown');
const loginGoogleBtn = document.getElementById('login-google');
const logoutGoogleBtn = document.getElementById('logout-google');
const saveFirebaseBtn = document.getElementById('save-firebase');
const loadFirebaseBtn = document.getElementById('load-firebase');
const saveLocalBtn = document.getElementById('save-watchlists');
const loadLocalBtn = document.getElementById('load-watchlists');
const userStatusEl = document.getElementById('user-status');


// --- State ---
let allWatchlists = {}; // { "List Name": ["AAPL", "MSFT"], ... }
let activeWatchlistName = "";
let currentQuoteData = {};
let currentUserUid = null; // Store logged-in user's UID
let isLoadingData = false; // Flag to prevent clashes during load

// --- Utility Functions ---
const setStatus = (message, type = 'info', duration = 4000) => {
  console.log(`[Status Update (${type})]: ${message}`);
  statusEl.textContent = message;
  statusEl.className = ''; // Clear existing classes first
  if (message) {
    statusEl.classList.add(`status-${type}`);
  }

  // Clear message after duration, only for non-error/loading messages
  if ((type === 'info' || type === 'success') && duration > 0) {
    setTimeout(() => {
      // Check if the message is still the same before clearing
      if (statusEl.textContent === message && (statusEl.classList.contains('status-info') || statusEl.classList.contains('status-success'))) {
        setStatus(''); // Clear the message
      }
    }, duration);
  }
};


const formatNumber = (num) => {
  if (num === null || num === undefined || num === '' || isNaN(num)) return 'N/A';
  let number = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num;
  if (isNaN(number)) return 'N/A';
  if (Math.abs(number) >= 1e12) return (number / 1e12).toFixed(2) + 'T';
  if (Math.abs(number) >= 1e9) return (number / 1e9).toFixed(2) + 'B';
  if (Math.abs(number) >= 1e6) return (number / 1e6).toFixed(2) + 'M';
  // Adjusted for smaller numbers needing decimals, while keeping integers as integers
  const formattingOptions = {
      minimumFractionDigits: 0,
      maximumFractionDigits: (Math.abs(number) > 0 && Math.abs(number) < 10) ? 2 : 0
  };
   // Handle edge case where toLocaleString might add .00 unnecessarily
   let formatted = number.toLocaleString(undefined, formattingOptions);
   if (number === Math.floor(number) && formatted.includes('.')) {
       formatted = number.toLocaleString(undefined, {maximumFractionDigits: 0});
   }
   return formatted;
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
  console.log(`[API Request] Fetching: ${endpoint.split('?')[0]}`); // Log endpoint without key
  if (!apiKey || apiKey.length < 10 || !apiKey.startsWith("cvi")) {
      throw new Error("API Key missing or appears invalid.");
  }
  try {
      const response = await fetch(`${finnhubBaseUrl}${fullEndpoint}`);
      const responseClone = response.clone(); // Clone for potential error logging
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
      // Rethrow the error so calling functions know it failed
      throw error;
  }
};


// --- App Data Persistence (Local Storage) ---
const saveAppDataToLocalStorage = () => {
  if (isLoadingData) return; // Don't save while loading
  try {
    localStorage.setItem(`${LS_PREFIX_APP}allWatchlists_v1`, JSON.stringify(allWatchlists));
    localStorage.setItem(`${LS_PREFIX_APP}activeWatchlistName_v1`, activeWatchlistName);
    // DCF values are saved individually in calculateDCF
    console.log("App data saved to Local Storage.");
    if (currentUserUid) {
      saveDataToFirebase(); // Auto-save to Firebase whenever state changes
    }
  } catch (e) {
    console.error("LS Save Error:", e);
    setStatus("Could not save app state locally.", "error");
  }
};

const loadAppDataFromLocalStorage = () => {
  try {
    const storedWatchlists = localStorage.getItem(`${LS_PREFIX_APP}allWatchlists_v1`);
    const storedActiveName = localStorage.getItem(`${LS_PREFIX_APP}activeWatchlistName_v1`);
    let loadedData = false;

    if (storedWatchlists) {
      allWatchlists = JSON.parse(storedWatchlists);
      // Basic validation
      if (typeof allWatchlists !== 'object' || allWatchlists === null) {
          console.warn("Stored watchlists format invalid, resetting.");
          allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
      } else {
          // Ensure all watchlist values are arrays
          Object.keys(allWatchlists).forEach(key => {
              if (!Array.isArray(allWatchlists[key])) {
                  console.warn(`Watchlist "${key}" was not an array, resetting it.`);
                  allWatchlists[key] = [];
              }
          });
          loadedData = true;
      }
    } else {
      allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
    }

    // If no watchlists exist after loading/resetting, create the default one
    if (Object.keys(allWatchlists).length === 0) {
        allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
        activeWatchlistName = DEFAULT_WATCHLIST_NAME;
        console.log("No watchlists found, created default list.");
    } else if (loadedData && storedActiveName && allWatchlists[storedActiveName]) {
        // Use stored active name if it's valid
        activeWatchlistName = storedActiveName;
    } else {
        // Otherwise, default to the first available list name
        activeWatchlistName = Object.keys(allWatchlists)[0];
    }

    console.log("App data loaded from Local Storage. Active list:", activeWatchlistName);

    // Final check: Ensure the determined activeWatchlistName actually exists
    if (!allWatchlists[activeWatchlistName]) {
        console.warn(`Active list "${activeWatchlistName}" invalid after load, switching to first available.`);
        activeWatchlistName = Object.keys(allWatchlists)[0] || DEFAULT_WATCHLIST_NAME;
        // If still no valid list, reset completely
        if (!allWatchlists[activeWatchlistName]) {
            allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
            activeWatchlistName = DEFAULT_WATCHLIST_NAME;
        }
        saveAppDataToLocalStorage(); // Save the corrected state
    }

  } catch (e) {
    console.error("LS Load Error:", e);
    allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
    activeWatchlistName = DEFAULT_WATCHLIST_NAME;
    setStatus("Could not load previous state, reset to default.", "error");
  }
  // Update UI based on loaded data
  populateWatchlistSelector();
  renderWatchlist();
};

// --- Firebase Authentication ---
const updateLoginUI = (user) => {
  if (user) {
    currentUserUid = user.uid;
    userStatusEl.textContent = `Logged in as ${user.displayName || user.email}`;
    loginGoogleBtn.style.display = 'none';
    logoutGoogleBtn.style.display = 'block';
    saveFirebaseBtn.style.display = 'block'; // Show Firebase buttons when logged in
    loadFirebaseBtn.style.display = 'block';
  } else {
    currentUserUid = null;
    userStatusEl.textContent = 'Not logged in';
    loginGoogleBtn.style.display = 'block';
    logoutGoogleBtn.style.display = 'none';
    saveFirebaseBtn.style.display = 'none'; // Hide Firebase buttons when logged out
    loadFirebaseBtn.style.display = 'none';
  }
};

const signInWithGoogle = async () => {
  setStatus('Logging in with Google...', 'loading', 0); // Indefinite loading message
  try {
    await fbAuth.signInWithPopup(googleProvider);
    // Auth state listener will handle UI updates and potential data load
    setStatus('Login successful!', 'success');
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    setStatus(`Login failed: ${error.message}`, 'error');
  }
};

const signOutGoogle = async () => {
  setStatus('Logging out...', 'loading', 0);
  try {
    await fbAuth.signOut();
    // Auth state listener handles UI updates
    setStatus('Logout successful.', 'success');
    // Optionally: Reload data from local storage after logout?
    // loadAppDataFromLocalStorage(); // Re-loads local data, potentially overwriting unsaved cloud changes
    // For simplicity, we'll just update the UI via the listener for now.
  } catch (error) {
    console.error("Sign Out Error:", error);
    setStatus(`Logout failed: ${error.message}`, 'error');
  }
};

// --- Firebase Firestore Data Management ---
const getRelevantLocalStorageData = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(LS_PREFIX_APP) || key.startsWith(LS_PREFIX_DCF)) {
            data[key] = localStorage.getItem(key);
        }
    }
    return data;
};

const clearRelevantLocalStorageData = () => {
    console.log("Clearing relevant local storage before cloud load...");
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(LS_PREFIX_APP) || key.startsWith(LS_PREFIX_DCF)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`  Removed: ${key}`);
    });
};


const saveDataToFirebase = async () => {
  if (!currentUserUid) {
    setStatus("You must be logged in to save to the cloud.", "error");
    return;
  }
  setStatus('Saving data to cloud...', 'loading', 0);
  const dataToSave = getRelevantLocalStorageData();

  if (Object.keys(dataToSave).length === 0) {
      setStatus("No watchlist data found in local storage to save.", "info");
      return;
  }
  // Add a timestamp for info
  dataToSave[`${LS_PREFIX_APP}lastSavedTimestamp`] = firebase.firestore.FieldValue.serverTimestamp();

  try {
    const userDocRef = fbStore.collection('userWatchlists').doc(currentUserUid);
    await userDocRef.set(dataToSave); // Use set to overwrite completely with current local state
    setStatus('Watchlists saved to cloud successfully!', 'success');
  } catch (error) {
    console.error("Firestore Save Error:", error);
    setStatus(`Failed to save to cloud: ${error.message}`, 'error');
  }
};

const loadDataFromFirebase = async () => {
  if (!currentUserUid) {
    setStatus("You must be logged in to load from the cloud.", "error");
    return;
  }
  isLoadingData = true; // Set flag
  setStatus('Loading data from cloud...', 'loading', 0);

  try {
    const userDocRef = fbStore.collection('userWatchlists').doc(currentUserUid);
    const docSnap = await userDocRef.get();

    if (docSnap.exists) {
      const cloudData = docSnap.data();
      console.log("Cloud data found:", cloudData);

      clearRelevantLocalStorageData(); // Clear local before loading from cloud

      // Populate local storage with cloud data
      Object.keys(cloudData).forEach(key => {
        // Don't restore the timestamp field itself or legacy fields if needed
         if (key !== `${LS_PREFIX_APP}lastSavedTimestamp` && key !== 'stockApp_watchlists' && key !== 'stockApp_activeList') { // Add legacy checks if needed
            // Firestore Timestamps need careful handling if stored directly; assume strings for now
            const value = cloudData[key];
             // Example: Convert Firestore timestamp object back to string if necessary
             // if (value && typeof value === 'object' && value.hasOwnProperty('seconds')) {
             //     value = new Date(value.seconds * 1000).toISOString(); // Example conversion
             // }
            localStorage.setItem(key, value);
            console.log(`  Loaded ${key} to localStorage`);
         }
      });

      // Now reload the application state from the *newly populated* local storage
      loadAppDataFromLocalStorage(); // This will re-render the UI

      setStatus('Watchlists loaded from cloud successfully!', 'success');
    } else {
      setStatus('No watchlist data found in the cloud for your account.', 'info');
      // Optional: clear local storage here too if desired, or leave it as is.
      // clearRelevantLocalStorageData();
      // loadAppDataFromLocalStorage(); // Reload defaults if local was cleared
    }
  } catch (error) {
    console.error("Firestore Load Error:", error);
    setStatus(`Failed to load from cloud: ${error.message}`, 'error');
  } finally {
      isLoadingData = false; // Reset flag
  }
};

// --- API Fetching (Combined for basic data) ---
const fetchBasicData = async (symbol, liElement) => {
  const priceEl = liElement.querySelector('.stock-price');
  const nameEl = liElement.querySelector('.stock-name');
  if (!priceEl || !nameEl) return;
  priceEl.textContent = '(--)';
  nameEl.textContent = '(Loading...)';
  currentQuoteData[symbol] = {}; // Reset data for this symbol
  try {
      // Fetch quote and profile concurrently
      const [quote, profile] = await Promise.all([
          finnhubFetch(`/quote?symbol=${symbol}`),
          finnhubFetch(`/stock/profile2?symbol=${symbol}`)
      ]);

      // Process quote data
      if (quote && typeof quote.c === 'number') {
          currentQuoteData[symbol].price = quote.c;
          priceEl.textContent = formatPrice(quote.c);
      } else {
          console.warn(`Quote data incomplete for ${symbol}:`, quote);
          priceEl.textContent = 'N/A';
          currentQuoteData[symbol].price = null; // Explicitly set to null
      }

      // Process profile data
      if (profile && profile.name) {
          nameEl.textContent = profile.name;
          // Safely calculate market cap and shares outstanding
          currentQuoteData[symbol].marketCap = (typeof profile.marketCapitalization === 'number') ? profile.marketCapitalization * 1e6 : null;
          currentQuoteData[symbol].sharesOutstanding = (typeof profile.shareOutstanding === 'number') ? profile.shareOutstanding * 1e6 : null;
          // Check for ticker mismatch only if profile ticker exists
          if (profile.ticker && profile.ticker.toUpperCase() !== symbol.toUpperCase()) {
            console.warn(`Profile ticker mismatch? Symbol: ${symbol}, Profile Ticker: ${profile.ticker}`);
          }
      } else {
          console.warn(`Profile data incomplete for ${symbol}:`, profile);
          nameEl.textContent = '(Name N/A)';
          currentQuoteData[symbol].marketCap = null;
          currentQuoteData[symbol].sharesOutstanding = null;
      }

  } catch (error) {
      // Handle errors during fetch or processing
      if (!priceEl.textContent || priceEl.textContent === '(--)') priceEl.textContent = 'Error';
      if (!nameEl.textContent || nameEl.textContent === '(Loading...)') nameEl.textContent = '(Error)';
      setStatus(`Basic Data Err (${symbol}): ${error.message.substring(0, 100)}`, "error");
      // Ensure state reflects error
      currentQuoteData[symbol] = { price: null, marketCap: null, sharesOutstanding: null };
  }
};

// --- Value Finder (Corrected Path + Cleaned Logs - from v9) ---
const findValue = (reportItem, conceptKeys) => {
  const actualReportData = reportItem?.report;
  if (!actualReportData || typeof actualReportData !== 'object') {
    // console.log(`findValue: No report data for year ${reportItem?.year}`);
    return null;
  }
  // Define the sections to check, in preferred order maybe?
  const reportSections = { ic: actualReportData.ic, bs: actualReportData.bs, cf: actualReportData.cf };

  for (const key of conceptKeys) {
    const targetKey = key.trim(); // Trim whitespace from concept key

    // Check within standard sections (ic, bs, cf)
    for (const sectionName in reportSections) {
      const section = reportSections[sectionName];
      if (Array.isArray(section)) {
        const item = section.find(el => el?.concept?.trim() === targetKey);
        if (item && item.value !== undefined && item.value !== null) {
           let value = typeof item.value === 'string' ? parseFloat(item.value.replace(/,/g, '')) : item.value;
           if (!isNaN(value)) {
             // console.log(`findValue: Found ${targetKey} in section ${sectionName} (Year ${reportItem?.year}): ${value}`);
             return value;
           }
        }
      }
    }

    // Check directly within the report object (less common, but possible)
    if (actualReportData[targetKey] !== undefined && actualReportData[targetKey] !== null) {
         let value = typeof actualReportData[targetKey] === 'string' ? parseFloat(actualReportData[targetKey].replace(/,/g, '')) : actualReportData[targetKey];
         if (!isNaN(value)) {
            // console.log(`findValue: Found ${targetKey} directly in report (Year ${reportItem?.year}): ${value}`);
            return value;
         }
    }
  }
  // console.log(`findValue: Concept keys [${conceptKeys.join(', ')}] not found in report for year ${reportItem?.year}`);
  return null; // Return null if none of the concepts are found
};

// --- CAGR Calculation ---
const calculateCAGR = (startVal, endVal, years) => {
  // console.log(`Calculating CAGR: Start=${startVal}, End=${endVal}, Years=${years}`);
  // Basic validation
  if (startVal === null || endVal === null || typeof startVal !== 'number' || typeof endVal !== 'number' || isNaN(startVal) || isNaN(endVal) || years <= 0) {
    // console.log(" -> Invalid input for CAGR");
    return null;
  }
  // Handle zero or negative start value appropriately
  if (startVal === 0) {
    // console.log(" -> Start value is zero, CAGR is infinite or undefined");
    return (endVal > 0) ? Infinity : (endVal < 0 ? -Infinity: 0); // Or return null, depending on desired behavior
  }
   // Handle sign change (e.g., -100 to 100). CAGR formula is problematic here.
   // Return null or a specific indicator if signs differ, unless it's a percentage where it might make sense.
   if (startVal < 0 && endVal > 0 && !String(startVal).includes('%') ) { // Check if it looks like a non-percentage
       // console.log(" -> Sign change detected (negative to positive), CAGR is ambiguous. Returning null.");
       // return null; // Often best to return null or handle this case specifically based on the metric
   }
   // If start is negative and end is also negative, the ratio is positive, formula works mathematically
   if (startVal < 0 && endVal < 0) {
       // Normalize for calculation: calculate with positive values
       const cagr = (Math.pow((-endVal) / (-startVal), 1 / years)) - 1;
       // console.log(` -> Negative start/end. CAGR: ${cagr * 100}%`);
       // The result needs interpretation. A smaller negative number means growth.
       // If cagr is positive, it means the value moved closer to zero (improved).
       // If cagr is negative, it means the value became more negative (worsened).
       return cagr * 100;
   }
   // Standard calculation for positive start value
  const cagr = (Math.pow(endVal / startVal, 1 / years)) - 1;
  // console.log(` -> Calculated CAGR: ${cagr * 100}%`);
  return cagr * 100; // Return as percentage
};

// --- Get Color Class for Percentage (Refined Logic for Debt Growth - v26) ---
const getPercentageColorClass = (value, metricType = 'good', isGrowthRate = false) => {
    if (value === null || isNaN(value)) return '';

    // Handle infinite values from CAGR
    if (!isFinite(value)) {
        return (value > 0) ? 'bg-green' : 'bg-red'; // Infinite positive growth is green, infinite negative is red
    }

    // Standard 'good' metric (higher is better)
    if (metricType === 'good') {
        // Color based on the value itself (e.g., margin percentage)
        if (!isGrowthRate) {
             if (value <= 0) return 'bg-red';
             if (value <= 5) return 'bg-light-red';
             if (value <= 15) return 'bg-yellow';
             if (value <= 25) return 'bg-light-green';
             return 'bg-green'; // > 25%
        }
        // Color based on the growth rate (e.g., revenue growth)
        else {
             if (value <= 0) return 'bg-red'; // Negative growth is bad
             if (value <= 5) return 'bg-light-red'; // Low growth
             if (value <= 15) return 'bg-yellow'; // Moderate growth
             if (value <= 25) return 'bg-light-green'; // Good growth
             return 'bg-green'; // Excellent growth > 25%
        }
    }
    // 'Bad' metric (lower is better, e.g., Debt ratio)
    else if (metricType === 'bad') {
         // Color based on the value itself (e.g., Debt/Asset Ratio %)
         if (!isGrowthRate) {
             if (value <= 30) return 'bg-green'; // Low ratio is good
             if (value <= 45) return 'bg-light-green';
             if (value <= 60) return 'bg-yellow'; // Moderate/warning
             if (value <= 75) return 'bg-light-red';
             return 'bg-red'; // High ratio is bad > 75%
         }
         // Color based on the growth rate of a 'bad' metric (e.g., Liability growth)
         // Here, negative growth (decrease) is good, positive growth (increase) is bad.
         else {
             if (value <= 0) return 'bg-green'; // Liabilities decreasing is good
             if (value <= 5) return 'bg-light-green'; // Low growth in liabilities
             if (value <= 10) return 'bg-yellow'; // Moderate growth
             if (value <= 15) return 'bg-light-red'; // High growth
             return 'bg-red'; // Very high growth in liabilities > 15% is bad
         }
    }
    return ''; // Default no color
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

  // Clear previous results immediately
  outputEl.innerHTML = '<p class="status-loading">Calculating...</p>'; // Show loading state
  comparisonEl.textContent = '';
  comparisonEl.className = ''; // Clear color classes

  try {
    // Find input elements using their specific IDs
    const fcf0Input = valuationSection.querySelector(`#dcf-fcf0-${symbol}`);
    const grInput = valuationSection.querySelector(`#dcf-gr-${symbol}`);
    const nInput = valuationSection.querySelector(`#dcf-n-${symbol}`);
    const rInput = valuationSection.querySelector(`#dcf-r-${symbol}`);
    const gInput = valuationSection.querySelector(`#dcf-g-${symbol}`);

    // Validate that all input elements were found
    if (!fcf0Input || !grInput || !nInput || !rInput || !gInput) {
        throw new Error("One or more DCF input fields not found.");
    }

    // Parse input values
    const fcf0 = parseFloat(fcf0Input.value);
    const gr = parseFloat(grInput.value) / 100; // Convert percentage to decimal
    const n = parseInt(nInput.value, 10);
    const r = parseFloat(rInput.value) / 100; // Convert percentage to decimal
    const g = parseFloat(gInput.value) / 100; // Convert percentage to decimal

    // Save current inputs to Local Storage (scoped by list name and symbol)
    const storagePrefix = `${LS_PREFIX_DCF}${activeWatchlistName}-${symbol}`;
    localStorage.setItem(`${storagePrefix}-fcf0`, fcf0Input.value);
    localStorage.setItem(`${storagePrefix}-gr`, grInput.value);
    localStorage.setItem(`${storagePrefix}-n`, nInput.value);
    localStorage.setItem(`${storagePrefix}-r`, rInput.value);
    localStorage.setItem(`${storagePrefix}-g`, gInput.value);
    console.log(`[DCF] Saved inputs to localStorage for ${storagePrefix}`);

    // Input validation
    if (isNaN(fcf0) || isNaN(gr) || isNaN(n) || isNaN(r) || isNaN(g)) {
      throw new Error("Invalid input. Please enter numbers.");
    }
    if (n <= 0 || n > 20) {
      throw new Error("High-Growth Years (n) must be between 1 and 20.");
    }
     if (r <= g) {
      throw new Error("Discount Rate (R) must be greater than Terminal Growth Rate (g).");
    }
    if (r <= 0) {
        throw new Error("Discount Rate (R) must be positive.");
    }
    // It's possible for g to be negative, representing a declining terminal state.
    // if (g < 0) {
    //   console.warn(`Terminal Growth Rate (g) is negative (${g*100}%)`);
    // }

    // --- DCF Calculation Logic ---
    let pvSum = 0;
    let currentFCF = fcf0;

    // 1. Calculate Present Value of FCF during the high-growth period (n years)
    for (let year = 1; year <= n; year++) {
      currentFCF *= (1 + gr); // FCF grows at rate 'gr'
      const pvFCF = currentFCF / Math.pow(1 + r, year); // Discount back to present value
      pvSum += pvFCF;
      // console.log(`Year ${year}: FCF = ${formatNumber(currentFCF)}, PV = ${formatNumber(pvFCF)}`);
    }
    // console.log(`Sum of PV of FCFs (Years 1-${n}): ${formatNumber(pvSum)}`);

    // 2. Calculate Terminal Value (Gordon Growth Model)
    // FCF in year n+1
    const fcfNplus1 = currentFCF * (1 + g);
    // Terminal Value at year n
    const terminalValue = fcfNplus1 / (r - g);
    // console.log(`FCF Year ${n+1}: ${formatNumber(fcfNplus1)}`);
    // console.log(`Terminal Value at Year ${n}: ${formatNumber(terminalValue)}`);


    // 3. Calculate Present Value of Terminal Value
    const pvTerminalValue = terminalValue / Math.pow(1 + r, n);
    // console.log(`PV of Terminal Value: ${formatNumber(pvTerminalValue)}`);


    // 4. Calculate Total Intrinsic Value (Equity Value)
    const totalIntrinsicValue = pvSum + pvTerminalValue;

    // 5. Calculate Intrinsic Value per Share
    const sharesOutstanding = currentQuoteData[symbol]?.sharesOutstanding;
     let intrinsicValuePerShare = null;
     if (sharesOutstanding && sharesOutstanding > 0) {
         intrinsicValuePerShare = totalIntrinsicValue / sharesOutstanding;
     } else {
         console.warn(`Cannot calculate Per Share Value for ${symbol}: Missing or zero shares outstanding data.`);
     }

    // Display Results
    outputEl.innerHTML = `
      <p><span>Total Intrinsic Value:</span> ${formatNumber(totalIntrinsicValue)}</p>
      <p><span>Intrinsic Value / Share:</span> ${intrinsicValuePerShare !== null ? formatPrice(intrinsicValuePerShare) : 'N/A (Missing Shares Data)'}</p>
    `;

    // Compare with Market Price
    const marketPrice = currentQuoteData[symbol]?.price;
    if (intrinsicValuePerShare !== null && marketPrice !== null && marketPrice > 0) {
        const difference = ((intrinsicValuePerShare - marketPrice) / marketPrice) * 100;
        if (intrinsicValuePerShare > marketPrice) {
            comparisonEl.textContent = `Potentially Undervalued by ${formatPercent(difference)}`;
            comparisonEl.className = 'value-undervalued';
        } else if (intrinsicValuePerShare < marketPrice) {
            comparisonEl.textContent = `Potentially Overvalued by ${formatPercent(Math.abs(difference))}`;
            comparisonEl.className = 'value-overvalued';
        } else {
            comparisonEl.textContent = `Potentially Fairly Valued`;
            comparisonEl.className = ''; // No specific color
        }
    } else {
        comparisonEl.textContent = '(Comparison N/A)';
        comparisonEl.className = '';
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
    setStatus(`Error: Could not find valuation section for ${symbol}`, "error");
    return;
  }

  const inputs = {
    fcf0: valuationSection.querySelector(`#dcf-fcf0-${symbol}`),
    gr: valuationSection.querySelector(`#dcf-gr-${symbol}`),
    n: valuationSection.querySelector(`#dcf-n-${symbol}`),
    r: valuationSection.querySelector(`#dcf-r-${symbol}`),
    g: valuationSection.querySelector(`#dcf-g-${symbol}`)
  };

  const storagePrefix = `${LS_PREFIX_DCF}${activeWatchlistName}-${symbol}`;
  let defaultsRestored = false;
  let errorsEncountered = false;

  for (const key in inputs) {
    const inputElement = inputs[key];
    if (inputElement) {
        // Retrieve the default value stored in the data attribute
        const defaultValue = inputElement.dataset.defaultValue;

        if (defaultValue !== undefined) {
            inputElement.value = defaultValue; // Reset input field to default
            localStorage.removeItem(`${storagePrefix}-${key}`); // Remove the override from local storage
            console.log(`  Reset ${key} for ${symbol}. Removed ${storagePrefix}-${key} from LS.`);
            defaultsRestored = true;
        } else {
            console.warn(`Could not find default value (data-default-value) for input ${key} for symbol ${symbol}`);
            // Optionally clear the input or leave it as is
            // inputElement.value = ''; // Or keep existing value if default is missing
            errorsEncountered = true;
        }
    } else {
      console.warn(`Could not find input element for ${key} for symbol ${symbol}`);
      errorsEncountered = true;
    }
  }

  // Clear the output and comparison areas after resetting inputs
  const outputEl = valuationSection.querySelector('#dcf-output');
  const comparisonEl = valuationSection.querySelector('#dcf-comparison');
  if (outputEl) outputEl.innerHTML = '';
  if (comparisonEl) {
      comparisonEl.textContent = '';
      comparisonEl.className = '';
  }

   // Automatically recalculate DCF with the reset defaults
   if (defaultsRestored) {
       calculateDCF(symbol); // Trigger calculation after resetting
       setStatus(`DCF inputs reset to defaults and recalculated for ${symbol}.`, 'info');
   } else if (errorsEncountered) {
       setStatus(`Could not reset all defaults for ${symbol}. Check console for details.`, 'error');
   }
};

// --- fetchFinancials (v33+ - Shows Reported FCF/Cash, uses Calculated FCF for DCF) ---
const fetchFinancials = async (symbol, detailsContainer) => {
    console.log(`[fetchFinancials] Starting for ${symbol}`);
    // Clear previous content and show loading state immediately
    detailsContainer.innerHTML = '<p class="status-loading">Loading details...</p>';
    detailsContainer.style.display = 'block'; // Ensure container is visible

    // --- Data Structure Initialization ---
    const results = {
        current: { price: null, marketCap: null, beta: null }, // From basic data + metrics
        currentValuation: { pe: null, ps: null, pb: null, pfcf: null }, // Derived from latest data
        historical: {}, // Stores arrays/objects of historical metrics { 'Revenue': { 0: val, -1: val, ...}, ...}
        growth: {}, // Stores calculated CAGR { 'Revenue': { '1Y': %, '5Y': %, ... }, ... }
        dcfDefaults: { fcf0: 0, gr: 0.05, n: 5, r: 0.09, g: DEFAULT_TERMINAL_GROWTH_RATE } // Default fallback values
    };
    // Map metric names to how their percentage values should be colored ('good' = higher is better, 'bad' = lower is better)
    const metricTypeMap = {
        'Net Earn. Marg.(%)': 'good',
        'Debt/Asset Ratio (%)': 'bad',
        'ROA (%)': 'good',
        // Growth rates will use these types as well
        'Revenue': 'good',
        'EBIT': 'good',
        'Net Earnings': 'good',
        'Operating Cash Flow': 'good',
        // 'Free Cash Flow': 'good', // Keep type if calculating growth later
        'Reported FCF': 'good', // Reported FCF is generally good
        'Ending Cash': 'good',   // More cash is generally good
        'Capital Expenditures': 'bad', // Lower (less negative) CapEx growth might be good, but CapEx itself isn't inherently good/bad %
        'Total Assets': 'good',
        'Total Liabilities': 'bad',
        'Shareholders Equity': 'good'
    };
    // Define potential concept keys for finding values in Finnhub reports
     const metricDefinitions = {
        'Revenue': ['us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap_Revenues', 'us-gaap_SalesRevenueNet', 'Revenues', 'SalesRevenueNet', 'TotalRevenues', 'revenue'],
        'EBIT': ['us-gaap_OperatingIncomeLoss', 'OperatingIncomeLoss', 'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxExpenseBenefit', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxExpenseBenefit'], // Added Pretax Income as fallback
        'Net Earnings': ['us-gaap_NetIncomeLoss', 'us-gaap_ProfitLoss', 'NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic', 'ConsolidatedNetIncomeLoss', 'NetIncomeLossAttributableToParent', 'netIncome'],
        'Operating Cash Flow': ['us-gaap_NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations', 'us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
        'Capital Expenditures': ['us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', 'us-gaap_PurchaseOfPropertyPlantAndEquipment', 'us-gaap_PaymentsToAcquireProductiveAssets', 'PaymentsToAcquireProductiveAssets'], // CapEx is often negative
        // *** NEW/MODIFIED ***
        'Reported FCF': ['us-gaap_FreeCashFlow', 'FreeCashFlow'], // Attempt to find reported FCF (might often be null)
        'Ending Cash': ['us-gaap_CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalentsAtCarryingValue'], // Cash on Balance Sheet
        // *** END NEW/MODIFIED ***
        'Total Assets': ['us-gaap_Assets', 'Assets', 'totalAssets'],
        'Total Liabilities': ['us-gaap_Liabilities', 'Liabilities', 'totalLiabilities'],
        'Shareholders Equity': ['us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'us-gaap_StockholdersEquity', 'us-gaap_EquityAttributableToParent', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity', 'TotalEquity', 'totalStockholdersEquity', 'EquityAttributableToParent', 'us-gaap_Assets', 'us-gaap_Liabilities'] // Added A-L as fallback for equity
     };

    try {
        // --- Initial Data Fetching ---
        // Fetch financials and metrics concurrently
        const [financialsData, metricsData] = await Promise.all([
            finnhubFetch(`/stock/financials-reported?symbol=${symbol}&freq=annual`),
            finnhubFetch(`/stock/metric?symbol=${symbol}&metric=all`)
        ]).catch(err => {
             // If *any* initial fetch fails, stop processing for this symbol
             throw new Error(`Failed initial API fetch: ${err.message}`);
        });

        // Populate current data from basic info (already fetched) and metrics
        results.current.price = currentQuoteData[symbol]?.price ?? null;
        results.current.marketCap = currentQuoteData[symbol]?.marketCap ?? null;
        results.current.beta = metricsData?.metric?.beta ?? null;

        // --- Process Financial Statements ---
        if (!financialsData?.data?.length) {
            throw new Error("No annual financial data array returned from API.");
        }

        // Sort data by year descending to easily find latest and previous years
        const sortedData = [...financialsData.data]
            .filter(item => item && item.year && item.endDate) // Basic validation of items
            .sort((a, b) => b.year - a.year);

        if (sortedData.length === 0) {
            throw new Error("No valid annual financial reports found after sorting.");
        }

        const latestReportItem = sortedData[0];
        const latestYear = latestReportItem.year;
        console.log(`Latest report year: ${latestYear}`);

        // Define the historical offsets we want to display/calculate (0 = latest)
        // Need extra years for CAGR calculations (e.g., need T-10 and T-11 for 10Y ROA)
        const requiredOffsets = new Set([0, -1, -2, -3, -5, -6, -10, -11]); // Ensure necessary lookback years
        const displayOffsets = [0, -1, -2, -5, -10]; // Offsets primarily for table display

        // --- Extract Historical Fundamental Data ---
        // Initialize historical results structure
        Object.keys(metricDefinitions).forEach(metricName => {
            results.historical[metricName] = {};
        });
         // Add derived metrics
         results.historical['Net Earn. Marg.(%)'] = {};
         // results.historical['Free Cash Flow'] = {}; // No longer storing calculated FCF here for display
         results.historical['Debt/Asset Ratio (%)'] = {};
         results.historical['ROA (%)'] = {};
         results.historical['INTERNAL_Assets_Avg'] = {}; // For ROA calc

        // Store calculated FCF specifically for DCF default calculation later
        let latestCalculatedFcf = null;

        // Populate historical data by finding values for each required offset year
        requiredOffsets.forEach(offset => {
            const targetYear = latestYear + offset;
            const reportItemForYear = sortedData.find(item => item.year === targetYear);

            if (reportItemForYear) {
                 // Find base metrics using findValue
                 Object.keys(metricDefinitions).forEach(metricName => {
                     results.historical[metricName][offset] = findValue(reportItemForYear, metricDefinitions[metricName]);
                 });

                  // Handle Equity special case (A - L) if direct concepts fail
                  if (results.historical['Shareholders Equity'][offset] === null && results.historical['Total Assets'][offset] !== null && results.historical['Total Liabilities'][offset] !== null) {
                      results.historical['Shareholders Equity'][offset] = results.historical['Total Assets'][offset] - results.historical['Total Liabilities'][offset];
                      console.log(`Calculated Equity for offset ${offset} as Assets - Liabilities`);
                  }

                  // *** Update for DCF FCF Calculation ***
                  if (offset === 0) {
                      const ocf0 = results.historical['Operating Cash Flow']?.[0];
                      const capex0 = results.historical['Capital Expenditures']?.[0];
                      if (ocf0 !== null && capex0 !== null) {
                          // Use subtraction to obtain free cash flow: OCF - CapEx
                          latestCalculatedFcf = ocf0 - capex0;
                      } else if (ocf0 !== null) {
                          latestCalculatedFcf = ocf0; // Fallback to OCF if CapEx missing
                      }
                      console.log(`[DCF Prep] Latest Calculated FCF (for default fcf0): ${latestCalculatedFcf}`);
                  }

            } else {
                // If no report for that year, set all metrics to null for that offset
                Object.keys(metricDefinitions).forEach(metricName => {
                    results.historical[metricName][offset] = null;
                });
                console.log(`No report found for offset ${offset} (Year ${targetYear})`);
            }
        });

        // --- NEW: Fallback for Reported FCF ---
        requiredOffsets.forEach(offset => {
            // If Reported FCF is missing, then calculate as Operating Cash Flow - Capital Expenditures
            if ((results.historical['Reported FCF'][offset] === null || results.historical['Reported FCF'][offset] === undefined)
               && results.historical['Operating Cash Flow'][offset] != null 
               && results.historical['Capital Expenditures'][offset] != null) {
                results.historical['Reported FCF'][offset] = results.historical['Operating Cash Flow'][offset] - results.historical['Capital Expenditures'][offset];
                console.log(`Calculated Reported FCF for offset ${offset} as OCF - CapEx: ${results.historical['Reported FCF'][offset]}`);
            }
        });

         // --- Calculate Derived Historical Metrics & Average Assets ---
         requiredOffsets.forEach(offset => {
             const revenueN = results.historical['Revenue']?.[offset];
             const netIncomeN = results.historical['Net Earnings']?.[offset];
             // const ocfN = results.historical['Operating Cash Flow']?.[offset]; // No longer needed here for calculated FCF display
             // const capexN = results.historical['Capital Expenditures']?.[offset];
             const assetsN = results.historical['Total Assets']?.[offset];
             const liabilitiesN = results.historical['Total Liabilities']?.[offset];
             const assetsNminus1 = results.historical['Total Assets']?.[offset - 1]; // Need prior year assets for ROA

             // Free Cash Flow (No longer calculated for display here)
             // results.historical['Free Cash Flow'][offset] = calculatedFcfValue;

             // Net Earning Margin
             results.historical['Net Earn. Marg.(%)'][offset] = (netIncomeN !== null && revenueN !== null && revenueN !== 0) ? (netIncomeN / revenueN) * 100 : null;

             // Debt/Asset Ratio
             results.historical['Debt/Asset Ratio (%)'][offset] = (liabilitiesN !== null && assetsN !== null && assetsN !== 0) ? (liabilitiesN / assetsN) * 100 : null;

             // Average Assets (needed for ROA)
             if (assetsN !== null && assetsNminus1 !== null) {
                 results.historical['INTERNAL_Assets_Avg'][offset] = (assetsN + assetsNminus1) / 2;
             } else {
                 results.historical['INTERNAL_Assets_Avg'][offset] = null; // Cannot calculate avg if T or T-1 is missing
             }

             // ROA (%) = Net Income / Average Total Assets
             const avgAssets = results.historical['INTERNAL_Assets_Avg'][offset];
             results.historical['ROA (%)'][offset] = (netIncomeN !== null && avgAssets !== null && avgAssets !== 0) ? (netIncomeN / avgAssets) * 100 : null;
         });


        // --- Estimate Historical Market Caps & Calculate Ratios ---
        // Calculate CURRENT valuation ratios using latest fundamentals (offset 0) and current market cap.
        const currentMarketCap = results.current.marketCap;
        const latestRevenue = results.historical['Revenue']?.[0];
        const latestNetIncome = results.historical['Net Earnings']?.[0];
        const latestEquity = results.historical['Shareholders Equity']?.[0];
        const latestReportedFCF = results.historical['Reported FCF']?.[0]; // Use reported FCF for P/FCF ratio

        results.currentValuation.pe = (currentMarketCap !== null && latestNetIncome !== null && latestNetIncome > 0) ? (currentMarketCap / latestNetIncome) : null;
        results.currentValuation.ps = (currentMarketCap !== null && latestRevenue !== null && latestRevenue !== 0) ? (currentMarketCap / latestRevenue) : null;
        results.currentValuation.pb = (currentMarketCap !== null && latestEquity !== null && latestEquity > 0) ? (currentMarketCap / latestEquity) : null;
        // Use REPORTED FCF for the P/FCF Ratio display if available, otherwise fallback to calculated or null
        const fcfForRatio = latestReportedFCF ?? latestCalculatedFcf; // Prefer reported for ratio display
        results.currentValuation.pfcf = (currentMarketCap !== null && fcfForRatio !== null && fcfForRatio !== 0) ? (currentMarketCap / fcfForRatio) : null;


        // --- Calculate Growth Rates (CAGR) ---
        const growthMetricsToCalc = Object.keys(metricTypeMap); // Calculate for all metrics with a type defined
        const growthYearsMap = { '1Y': 1, '2Y': 2, '5Y': 5, '10Y': 10 };

        growthMetricsToCalc.forEach(metric => {
             // Don't calculate growth for CapEx itself this way (sign issues) unless needed
             if (metric === 'Capital Expenditures') return;

            results.growth[metric] = {};
            const currentVal = results.historical[metric]?.[0]; // T=0 value

            Object.entries(growthYearsMap).forEach(([periodLabel, years]) => {
                const startOffset = -years;
                const startVal = results.historical[metric]?.[startOffset]; // T-years value
                // Calculate CAGR only if both start and end values are available numbers
                 if (typeof startVal === 'number' && typeof currentVal === 'number') {
                     results.growth[metric][periodLabel] = calculateCAGR(startVal, currentVal, years);
                 } else {
                     results.growth[metric][periodLabel] = null; // Mark as N/A if data missing
                 }
            });
        });

        // --- Calculate DCF Default Parameters ---
        // *** Use the CALCULATED latest FCF (OCF + CapEx) for fcf0 ***
        results.dcfDefaults.fcf0 = latestCalculatedFcf ?? 0; // Default to 0 if calculation failed

        // Weighted FCF Growth Rate (using CAGR of CALCULATED FCF if we were to compute it, or Reported FCF growth if available?)
        // Let's try using Reported FCF Growth if available, otherwise Revenue growth
        const fcfGrowthMetric = results.growth['Reported FCF'] ? 'Reported FCF' : null; // Check if growth was calculable for reported FCF
        const fcfCagr2Y = fcfGrowthMetric ? results.growth[fcfGrowthMetric]?.['2Y'] : null;
        const fcfCagr5Y = fcfGrowthMetric ? results.growth[fcfGrowthMetric]?.['5Y'] : null;
        const fcfCagr10Y = fcfGrowthMetric ? results.growth[fcfGrowthMetric]?.['10Y'] : null;

        let defaultGR = null; // Growth Rate in decimal
        const weights = { y2: 0.5, y5: 0.3, y10: 0.2 };
        let totalWeight = 0;
        let weightedSum = 0;

        if (fcfCagr2Y !== null && isFinite(fcfCagr2Y)) { weightedSum += weights.y2 * fcfCagr2Y; totalWeight += weights.y2; }
        if (fcfCagr5Y !== null && isFinite(fcfCagr5Y)) { weightedSum += weights.y5 * fcfCagr5Y; totalWeight += weights.y5; }
        if (fcfCagr10Y !== null && isFinite(fcfCagr10Y)) { weightedSum += weights.y10 * fcfCagr10Y; totalWeight += weights.y10; }

        if (totalWeight > 0) {
            defaultGR = (weightedSum / totalWeight) / 100; // Convert weighted avg % to decimal
            console.log("Used Reported FCF growth for default GR estimate.");
        } else {
             // Fallback if no FCF growth calculated - use Revenue growth
             const revCagr5Y = results.growth['Revenue']?.['5Y'];
             if (revCagr5Y !== null && isFinite(revCagr5Y)) {
                 defaultGR = (revCagr5Y / 100) * 0.8; // Use 80% of 5Y revenue growth as a proxy
                 console.log("Used Revenue 5Y CAGR for default GR estimate.");
             } else {
                 defaultGR = 0.05; // Absolute fallback
                 console.log("Used fixed 5% for default GR estimate.");
             }
        }
        // Clamp default growth rate (e.g., 0% to 20%)
        results.dcfDefaults.gr = Math.max(0, Math.min(defaultGR, 0.20));

        // Default High-Growth Years (n) - Heuristic based on recent growth vs longer term (using same FCF growth basis as GR)
        let defaultN = 5;
        if (fcfCagr2Y !== null && isFinite(fcfCagr2Y) && fcfCagr5Y !== null && isFinite(fcfCagr5Y)) {
            if (fcfCagr2Y < (fcfCagr5Y * 0.7)) defaultN = 3; // Growth slowing significantly
            else if (fcfCagr2Y >= fcfCagr5Y * 1.1) defaultN = 7; // Growth accelerating or sustained
        } else if (fcfCagr2Y !== null && isFinite(fcfCagr2Y) && fcfCagr2Y < 5) {
             defaultN = 3; // Low recent growth suggests shorter high-growth phase
        } else if (fcfCagr5Y !== null && isFinite(fcfCagr5Y) && fcfCagr5Y > 15) {
            defaultN = 7; // Strong long-term growth might persist
        }
        results.dcfDefaults.n = defaultN;

        // Default Discount Rate (R) - CAPM estimate using Beta
        let defaultR = 0.09; // Fallback discount rate
        const beta = results.current.beta;
        if (beta !== null && !isNaN(beta)) {
            defaultR = DEFAULT_RISK_FREE_RATE + beta * DEFAULT_EQUITY_RISK_PREMIUM;
            defaultR = Math.max(0.06, Math.min(defaultR, 0.15)); // Clamp R (e.g., 6% to 15%)
        }
        results.dcfDefaults.r = defaultR;

        // Default Terminal Growth Rate (g)
        results.dcfDefaults.g = DEFAULT_TERMINAL_GROWTH_RATE; // Usually a conservative long-term rate

        console.log(`[DCF Defaults] Calculated for ${symbol}:`, results.dcfDefaults);


        // --- Generate HTML Content ---
        // 1. Today's Snapshot Section
        let todayHtml = `
            <div class="today-section">
                <h4>Today's Snapshot</h4>
                <p><span>Price:</span> ${formatPrice(results.current.price)}</p>
                <p><span>Market Cap:</span> ${formatNumber(results.current.marketCap)}</p>
                <p><span>Beta:</span> ${formatRatio(results.current.beta)}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 8px 0;">
                <p><span>P/E Ratio (TTM):</span> ${formatRatio(results.currentValuation.pe)}</p>
                <p><span>P/S Ratio (TTM):</span> ${formatRatio(results.currentValuation.ps)}</p>
                <p><span>P/B Ratio (MRQ):</span> ${formatRatio(results.currentValuation.pb)}</p>
                <p><span>P/FCF Ratio (TTM):</span> ${formatRatio(results.currentValuation.pfcf)}</p>
            </div>`;

        // 2. Tab Buttons
        let tabsHtml = `
            <div class="tab-buttons">
                <button class="tab-button active" onclick="showTab(this, '${symbol}-snapshot')">Snapshot</button>
                <button class="tab-button" onclick="showTab(this, '${symbol}-growth')">Growth</button>
                <button class="tab-button" onclick="showTab(this, '${symbol}-dcf')">DCF</button>
            </div>`;

        // 3. Snapshot Tab Content (Historical Fundamentals)
        // *** UPDATED displayOrderSnapshot ***
        const displayOrderSnapshot = [
            'Revenue', 'EBIT', 'Net Earnings', 'Net Earn. Marg.(%)',
            'Operating Cash Flow', 'Capital Expenditures', 'Reported FCF', 'Ending Cash', // Added requested cash flow items
            'Total Assets', 'Total Liabilities', 'Shareholders Equity', 'Debt/Asset Ratio (%)', 'ROA (%)'
        ];
        // *** END UPDATE ***

        let snapshotContentHtml = `<div id="${symbol}-snapshot" class="tab-content active">
            <h4>Financial Snapshot (Annual - ${latestYear})</h4>
            <div class="table-container" style="overflow-x: auto;">
             <table class="details-table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Latest (T)</th>
                        <th>T-1</th>
                        <th>T-2</th>
                        <th>T-5</th>
                        <th>T-10</th>
                    </tr>
                </thead>
                <tbody>`;

        displayOrderSnapshot.forEach(metricName => {
            snapshotContentHtml += `<tr><td>${metricName}</td>`;
            displayOffsets.forEach(offset => {
                let displayValue = 'N/A';
                let colorClass = '';
                const value = results.historical[metricName]?.[offset];

                if (value !== null && typeof value === 'number') {
                    if (metricName.includes('%')) {
                        const type = metricTypeMap[metricName] || 'good'; // Default to 'good' if not found
                        colorClass = getPercentageColorClass(value, type, false); // false = not a growth rate
                        displayValue = formatPercent(value);
                    } else {
                         // CapEx is usually negative, formatNumber handles it. No special coloring needed unless comparing growth.
                        displayValue = formatNumber(value);
                    }
                }
                snapshotContentHtml += `<td class="${colorClass}">${displayValue}</td>`;
            });
            snapshotContentHtml += `</tr>`;
        });
        snapshotContentHtml += `</tbody></table></div></div>`; // Close table, container div, tab-content div

        // 4. Growth Tab Content (CAGR %)
        let growthContentHtml = `<div id="${symbol}-growth" class="tab-content">
            <h4>Annualized Growth Rates (CAGR %)</h4>
             <div class="table-container" style="overflow-x: auto;">
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
        // Use the same display order for consistency, filtering out non-growth items if needed
        const displayOrderGrowth = displayOrderSnapshot.filter(m => m !== 'Capital Expenditures'); // Filter out CapEx from growth view for now
        displayOrderGrowth.forEach(metricName => {
            growthContentHtml += `<tr><td>${metricName}</td>`;
            Object.entries(growthYearsMap).forEach(([periodLabel, years]) => {
                let displayValue = 'N/A';
                let colorClass = '';
                const value = results.growth[metricName]?.[periodLabel];

                if (value !== null && typeof value === 'number') {
                    const type = metricTypeMap[metricName] || 'good';
                    // Handle Infinity cases from CAGR
                    if (!isFinite(value)) {
                        displayValue = value > 0 ? "+Inf%" : "-Inf%";
                        colorClass = value > 0 ? 'bg-green' : 'bg-red';
                    } else {
                        colorClass = getPercentageColorClass(value, type, true); // true = is a growth rate
                        displayValue = formatPercent(value);
                    }
                }
                growthContentHtml += `<td class="${colorClass}">${displayValue}</td>`;
            });
            growthContentHtml += `</tr>`;
        });
        growthContentHtml += `</tbody></table></div></div>`; // Close table, container div, tab-content div

        // 5. DCF Tab Content (Inputs and Output)
        const storagePrefix = `${LS_PREFIX_DCF}${activeWatchlistName}-${symbol}`;
        // Load saved values or use calculated defaults
        // Ensure default fcf0 uses the calculated value, rounded
        const defaultFcf0String = results.dcfDefaults.fcf0 !== null ? results.dcfDefaults.fcf0.toFixed(0) : '0';
        const savedFcf0 = localStorage.getItem(`${storagePrefix}-fcf0`) ?? defaultFcf0String;
        const savedGr = localStorage.getItem(`${storagePrefix}-gr`) ?? (results.dcfDefaults.gr * 100).toFixed(1);
        const savedN = localStorage.getItem(`${storagePrefix}-n`) ?? results.dcfDefaults.n;
        const savedR = localStorage.getItem(`${storagePrefix}-r`) ?? (results.dcfDefaults.r * 100).toFixed(1);
        const savedG = localStorage.getItem(`${storagePrefix}-g`) ?? (results.dcfDefaults.g * 100).toFixed(1);

        let dcfContentHtml = `<div id="${symbol}-dcf" class="tab-content">
            <div id="valuation-section">
                <h4>FCF Discounted Cash Flow (DCF) Valuation</h4>
                 <p style="font-size: 0.85em; color: #555; margin-bottom: 10px;"><i>Note: FCF₀ below is based on Calculated FCF (OCF + CapEx) from the latest annual report.</i></p>
                <div class="valuation-inputs">
                    <div>
                        <label for="dcf-fcf0-${symbol}">Latest Calc. FCF (FCF₀)</label>
                        <input type="number" id="dcf-fcf0-${symbol}" step="any" value="${savedFcf0}" data-default-value="${defaultFcf0String}">
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
                    </div> <!-- closing valuation-inputs -->
                     <div class="valuation-buttons">
                        <button id="calculate-dcf-${symbol}" class="calculate-dcf" onclick="calculateDCF('${symbol}')">Calculate</button>
                        <button id="reset-dcf-${symbol}" class="reset-dcf" onclick="resetDCFDefaults('${symbol}')">Reset Defaults</button>
                    </div>

                <div id="dcf-output" style="margin-top: 15px;"></div>
                <p id="dcf-comparison" style="text-align: center; margin-top: 10px; font-weight: bold;"></p>
            </div>
        </div>`; // Close valuation-section, tab-content

        // --- Assemble Final HTML and Inject ---
        detailsContainer.innerHTML = todayHtml + tabsHtml + snapshotContentHtml + growthContentHtml + dcfContentHtml;
        // *** Updated Note ***
        detailsContainer.innerHTML += `<p style="font-size: 0.8em; color: #666; margin-top: 15px; padding: 0 10px;"><i>Note: Financials based on annual reports ending ~${latestReportItem.endDate}. TTM ratios use current market cap & latest annual fundamental data. CAGR calculated using available start/end points for the period. Reported FCF may differ from OCF + CapEx based on company reporting.</i></p>`;

        // --- Initial DCF Calculation ---
        // Calculate DCF automatically after loading the defaults/saved values
        calculateDCF(symbol);

    } catch (error) {
        console.error(`[fetchFinancials Error] for ${symbol}:`, error);
        // Display error within the details container
        detailsContainer.innerHTML = `<p class="status-error" style="padding:10px;">Error loading details: ${error.message}</p>`;
        detailsContainer.style.display = 'block'; // Ensure error is visible
    }
};


// --- Show Tab Function ---
const showTab = (buttonElement, tabIdToShow) => {
  const detailsContainer = buttonElement.closest('.details-container');
  if (!detailsContainer) {
      console.error("Could not find parent details container for tab:", tabIdToShow);
      return;
  }

  // Hide all tab content within this specific details container
  detailsContainer.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none'; // Ensure it's hidden
  });

  // Deactivate all tab buttons within this container
  detailsContainer.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });

  // Find and show the target tab content
  const contentToShow = detailsContainer.querySelector('#' + tabIdToShow);
  if (contentToShow) {
    contentToShow.classList.add('active');
    contentToShow.style.display = 'block'; // Ensure it's shown
  } else {
      console.error(`Tab content with ID ${tabIdToShow} not found.`);
  }

  // Activate the clicked button
  buttonElement.classList.add('active');
};

// --- Watchlist Management ---
const populateWatchlistSelector = () => {
  watchlistSelector.innerHTML = ''; // Clear existing options

  // Ensure allWatchlists is an object
  if (typeof allWatchlists !== 'object' || allWatchlists === null) {
      console.warn("allWatchlists is not an object. Resetting.");
      allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
      activeWatchlistName = DEFAULT_WATCHLIST_NAME;
      saveAppDataToLocalStorage(); // Save the reset state
  }
   // Ensure activeWatchlistName is valid, or reset it
   if (!allWatchlists[activeWatchlistName]) {
       activeWatchlistName = Object.keys(allWatchlists)[0] || DEFAULT_WATCHLIST_NAME;
       if (!allWatchlists[activeWatchlistName]) {
           allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
           activeWatchlistName = DEFAULT_WATCHLIST_NAME;
       }
       saveAppDataToLocalStorage(); // Save the corrected active name
   }


  const listNames = Object.keys(allWatchlists).sort();

  if (listNames.length === 0) {
      // If somehow all lists were deleted, recreate default
       console.warn("No watchlist names found. Recreating default.");
       allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] };
       activeWatchlistName = DEFAULT_WATCHLIST_NAME;
       listNames.push(DEFAULT_WATCHLIST_NAME);
       saveAppDataToLocalStorage();
  }


  listNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === activeWatchlistName) {
      option.selected = true; // Select the current active list
    }
    watchlistSelector.appendChild(option);
  });

  // Add the "+ New Watchlist" option
  const newOption = document.createElement('option');
  newOption.value = NEW_WATCHLIST_OPTION_VALUE;
  newOption.textContent = "+ New Watchlist";
  watchlistSelector.appendChild(newOption);

  // Enable/disable rename/delete buttons based on whether multiple lists exist
  const canModify = listNames.length > 1;
  renameBtn.disabled = !canModify;
  deleteBtn.disabled = !canModify;
};

const handleWatchlistChange = (selectedValue) => {
  if (isLoadingData) return; // Prevent changes while loading data

  if (selectedValue === NEW_WATCHLIST_OPTION_VALUE) {
    // --- Create New Watchlist ---
    const newListName = prompt("Enter name for the new watchlist:");
    if (newListName && newListName.trim()) {
      const trimmedName = newListName.trim();
      if (allWatchlists[trimmedName]) {
        setStatus(`Watchlist "${trimmedName}" already exists.`, 'error');
        watchlistSelector.value = activeWatchlistName; // Reset selector
      } else {
        allWatchlists[trimmedName] = []; // Create empty list
        activeWatchlistName = trimmedName; // Set as active
        saveAppDataToLocalStorage(); // Save the new structure
        // No need to save to Firebase here, let user do it explicitly
        populateWatchlistSelector(); // Update dropdown
        renderWatchlist(); // Render the (empty) new list
        setStatus(`Created and switched to watchlist "${trimmedName}".`, 'success');
      }
    } else {
      // User cancelled or entered empty name, revert selector
      watchlistSelector.value = activeWatchlistName;
    }
  } else {
    // --- Switch to Existing Watchlist ---
    if (allWatchlists[selectedValue]) {
      activeWatchlistName = selectedValue;
      saveAppDataToLocalStorage(); // Save the new active list name
      renderWatchlist(); // Render the selected list
      setStatus(`Switched to watchlist "${activeWatchlistName}".`, 'info');
    } else {
      // This shouldn't happen if populateWatchlistSelector is correct
      console.error(`Selected watchlist "${selectedValue}" not found in state.`);
      setStatus(`Error: Watchlist "${selectedValue}" not found.`, 'error');
      // Revert selector to the known active name
      watchlistSelector.value = activeWatchlistName;
    }
  }
};

const renameCurrentList = () => {
  if (isLoadingData) return;
  const listNames = Object.keys(allWatchlists);
  if (listNames.length <= 1) {
    setStatus("Cannot rename the only existing watchlist.", "error");
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

  // Migrate list content
  allWatchlists[trimmedNewName] = [...allWatchlists[oldName]];
  delete allWatchlists[oldName]; // Remove the old list entry

  // --- Migrate Associated DCF Local Storage Data ---
  const symbolsInList = allWatchlists[trimmedNewName] || [];
  symbolsInList.forEach(symbol => {
    ['fcf0', 'gr', 'n', 'r', 'g'].forEach(keySuffix => {
      const oldStorageKey = `${LS_PREFIX_DCF}${oldName}-${symbol}-${keySuffix}`;
      const newStorageKey = `${LS_PREFIX_DCF}${trimmedNewName}-${symbol}-${keySuffix}`;
      const value = localStorage.getItem(oldStorageKey);
      if (value !== null) {
        localStorage.setItem(newStorageKey, value); // Set new key
        localStorage.removeItem(oldStorageKey); // Remove old key
        console.log(` Migrated LS key: ${oldStorageKey} -> ${newStorageKey}`);
      }
    });
  });

  // Update active name and save
  activeWatchlistName = trimmedNewName;
  saveAppDataToLocalStorage();
  // User needs to explicitly save to Firebase if logged in

  // Update UI
  populateWatchlistSelector();
  // renderWatchlist(); // Render watchlist is implicitly called by populate? No, call explicitly.
  renderWatchlist(); // Ensure the renamed list (now active) is rendered
  setStatus(`Renamed watchlist to "${trimmedNewName}".`, "success");
  if (currentUserUid) {
      setStatus(`Renamed watchlist to "${trimmedNewName}". Remember to save to cloud.`, "success");
  }
};

const deleteCurrentList = () => {
  if (isLoadingData) return;
  const listNames = Object.keys(allWatchlists);
  if (listNames.length <= 1) {
    setStatus("Cannot delete the only watchlist.", "error");
    return;
  }

  const listNameToDelete = activeWatchlistName;

  if (confirm(`Are you sure you want to delete the watchlist "${listNameToDelete}"? This cannot be undone locally.`)) {
    console.log(`Deleting list "${listNameToDelete}"`);

    // --- Remove Associated DCF Local Storage Data ---
    const symbolsToDelete = allWatchlists[listNameToDelete] || [];
    symbolsToDelete.forEach(symbol => {
      ['fcf0', 'gr', 'n', 'r', 'g'].forEach(keySuffix => {
        const storageKey = `${LS_PREFIX_DCF}${listNameToDelete}-${symbol}-${keySuffix}`;
        localStorage.removeItem(storageKey);
        console.log(` Removed LS key: ${storageKey}`);
      });
    });

    // Remove the list from the main state object
    delete allWatchlists[listNameToDelete];

    // Switch to the first remaining list
    activeWatchlistName = Object.keys(allWatchlists)[0];

    // Save the updated state
    saveAppDataToLocalStorage();
     // User needs to explicitly save to Firebase to reflect deletion there

    // Update UI
    populateWatchlistSelector();
    renderWatchlist(); // Render the new active list
    setStatus(`Deleted watchlist "${listNameToDelete}". Switched to "${activeWatchlistName}".`, "success");
     if (currentUserUid) {
      setStatus(`Deleted watchlist "${listNameToDelete}". Remember to save changes to cloud.`, "success");
    }
  } else {
    setStatus("Deletion cancelled.", "info");
  }
};

// --- Watchlist Rendering & Stock Actions ---
const renderWatchlist = () => {
  console.log("[renderWatchlist] Rendering list:", activeWatchlistName);
  watchlistEl.innerHTML = ''; // Clear previous list
  currentQuoteData = {}; // Reset quote data when list changes

  if (!allWatchlists[activeWatchlistName]) {
       console.error(`Attempted to render non-existent list: ${activeWatchlistName}. Resetting.`);
       loadAppDataFromLocalStorage(); // Attempt to reload and fix state
       // If it still fails, the error will be caught by loadAppData...
       return; // Avoid rendering garbage
  }

  const symbolsToRender = allWatchlists[activeWatchlistName] || [];

  if (symbolsToRender.length === 0) {
    watchlistEl.innerHTML = `<li style="text-align: center; padding: 20px; border: none; box-shadow: none; background: none;">Watchlist "${activeWatchlistName}" is empty. Add stocks using the input above.</li>`;
    // populateWatchlistSelector(); // Ensure selector is up-to-date (might be redundant)
    return; // Nothing more to render
  }

  // populateWatchlistSelector(); // Ensure selector is correct (might be redundant)

  // Create and append list items for each symbol
  symbolsToRender.forEach(symbol => {
    const li = document.createElement('li');
    li.dataset.symbol = symbol; // Store symbol for easy access
    // Set initial HTML structure for the stock item
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
      <div class="details-container" style="display: none;"></div>`; // Details hidden initially

    // --- Add Event Listeners for Buttons and Symbol ---
    const removeBtn = li.querySelector('.remove-button');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering other clicks on the list item
      removeStock(symbol);
    });

    const detailsBtn = li.querySelector('.details-button');
    const detailsContainer = li.querySelector('.details-container');
    const symbolSpan = li.querySelector('.stock-symbol'); // Make symbol clickable too

    // Function to toggle details visibility and fetch data if needed
    const toggleDetails = () => {
      console.log(`[Toggle Details] for ${symbol}`);
      const isVisible = detailsContainer.style.display === 'block';

      if (isVisible) {
        detailsContainer.style.display = 'none';
        detailsBtn.textContent = 'Details'; // Reset button text
      } else {
        detailsBtn.textContent = 'Hide'; // Change button text
        // Check if details need fetching (container is empty or has only loading/error message)
        const needsFetching = !detailsContainer.innerHTML.trim() || detailsContainer.querySelector('.status-loading, .status-error');
        if (needsFetching) {
          console.log(` -- Container empty or has status, fetching details...`);
          fetchFinancials(symbol, detailsContainer); // Fetch and display
        } else {
          console.log(` -- Container has content, just displaying.`);
          detailsContainer.style.display = 'block'; // Show existing content
        }
      }
    };

    // Attach toggle function to button and symbol clicks
    detailsBtn.addEventListener('click', toggleDetails);
    symbolSpan.addEventListener('click', toggleDetails);

    // Append the fully prepared list item to the watchlist
    watchlistEl.appendChild(li);

    // --- Fetch Basic Data (Price, Name) ---
    fetchBasicData(symbol, li); // Start fetching basic info asynchronously
  });
};

const addStock = () => {
  if (isLoadingData) return;
  const symbol = tickerInput.value.trim().toUpperCase();
  if (!symbol) {
    setStatus('Please enter a ticker symbol.', "error");
    return;
  }

  if (!activeWatchlistName || !allWatchlists[activeWatchlistName]) {
    setStatus('Error: No active watchlist selected or found.', "error");
    console.error("Add stock failed: Invalid active watchlist", activeWatchlistName, allWatchlists);
    return;
  }

  const currentList = allWatchlists[activeWatchlistName];

  if (currentList.includes(symbol)) {
    setStatus(`${symbol} is already in the "${activeWatchlistName}" watchlist.`, "info");
    tickerInput.value = ''; // Clear input even if duplicate
    return;
  }

  console.log(`Adding stock: ${symbol} to list: ${activeWatchlistName}`);
  currentList.push(symbol); // Add to the array in memory

  saveAppDataToLocalStorage(); // Save the change locally
   // Don't auto-save to Firebase, let user do it.

  // --- Add the new stock item to the UI immediately ---
  // Create and append the new list item without re-rendering the whole list
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

     // Add event listeners to the new item's buttons/symbol
    const removeBtn = li.querySelector('.remove-button');
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeStock(symbol); });
    const detailsBtn = li.querySelector('.details-button');
    const detailsContainer = li.querySelector('.details-container');
    const symbolSpan = li.querySelector('.stock-symbol');
    const toggleDetails = () => { /* ... same toggle logic as in renderWatchlist ... */
        const isVisible = detailsContainer.style.display === 'block';
        if (isVisible) { detailsContainer.style.display = 'none'; detailsBtn.textContent = 'Details'; }
        else {
             detailsBtn.textContent = 'Hide';
             const needsFetching = !detailsContainer.innerHTML.trim() || detailsContainer.querySelector('.status-loading, .status-error');
             if (needsFetching) { fetchFinancials(symbol, detailsContainer); }
             else { detailsContainer.style.display = 'block'; }
        }
    };
    detailsBtn.addEventListener('click', toggleDetails);
    symbolSpan.addEventListener('click', toggleDetails);

    // If the list was previously empty, remove the "empty" message
    const emptyMsg = watchlistEl.querySelector('li[style*="text-align: center"]');
    if (emptyMsg) {
        watchlistEl.innerHTML = ''; // Clear the empty message
    }

    watchlistEl.appendChild(li); // Add the new item
    fetchBasicData(symbol, li); // Fetch its basic data

  tickerInput.value = ''; // Clear the input field
  setStatus(`${symbol} added to "${activeWatchlistName}".`, "success");
   if (currentUserUid) {
      setStatus(`${symbol} added to "${activeWatchlistName}". Remember to save to cloud.`, "success");
  }
};

const removeStock = (symbolToRemove) => {
  if (isLoadingData) return;

  if (!activeWatchlistName || !allWatchlists[activeWatchlistName]) {
    setStatus('Error: No active watchlist selected or found.', "error");
    console.error("Remove stock failed: Invalid active watchlist", activeWatchlistName, allWatchlists);
    return;
  }

  console.log(`Removing stock: ${symbolToRemove} from list: ${activeWatchlistName}`);

  // Remove from the array in memory
  allWatchlists[activeWatchlistName] = allWatchlists[activeWatchlistName].filter(symbol => symbol !== symbolToRemove);

   // --- Remove Associated DCF Local Storage Data ---
   ['fcf0', 'gr', 'n', 'r', 'g'].forEach(keySuffix => {
        const storageKey = `${LS_PREFIX_DCF}${activeWatchlistName}-${symbolToRemove}-${keySuffix}`;
        localStorage.removeItem(storageKey);
        console.log(` Removed LS key: ${storageKey}`);
    });


  saveAppDataToLocalStorage(); // Save the change locally
   // Don't auto-save to Firebase

  // --- Remove the stock item from the UI ---
  const itemToRemove = watchlistEl.querySelector(`li[data-symbol="${symbolToRemove}"]`);
  if (itemToRemove) {
    itemToRemove.remove();
  } else {
      console.warn(`Could not find UI element for ${symbolToRemove} to remove.`);
      // Optionally re-render the whole list if UI removal fails
      // renderWatchlist();
  }

  // Check if the list is now empty and display message if so
  if (allWatchlists[activeWatchlistName].length === 0) {
       watchlistEl.innerHTML = `<li style="text-align: center; padding: 20px; border: none; box-shadow: none; background: none;">Watchlist "${activeWatchlistName}" is empty. Add stocks using the input above.</li>`;
  }


  setStatus(`${symbolToRemove} removed from "${activeWatchlistName}".`, "info");
   if (currentUserUid) {
      setStatus(`${symbolToRemove} removed from "${activeWatchlistName}". Remember to save changes to cloud.`, "info");
  }
};

// --- Hamburger Menu Functionality ---
const setupHamburgerMenu = () => {
    if (hamburgerIcon && menuDropdown) {
        hamburgerIcon.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent body click listener from closing immediately
            menuDropdown.classList.toggle('active');
        });

        // Close the menu if clicked outside
        document.body.addEventListener('click', (e) => {
            if (!hamburgerIcon.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.classList.remove('active');
            }
        });

        // Close menu when a link inside is clicked
        menuDropdown.querySelectorAll('a.yahoo-link-button').forEach(link => {
            link.addEventListener('click', (event) => { // Add event parameter
                 // Exception: Don't close immediately for file inputs
                 if (link.id === 'load-watchlists') {
                    // The file input logic will handle closing later
                    return;
                 }
                  // Exception: Don't close for login/logout actions? Let status updates guide user.
                 // Or close immediately? Let's close immediately for simplicity now.
                 // if (link.id === 'login-google' || link.id === 'logout-google') {
                 //   return;
                 // }

                 menuDropdown.classList.remove('active');

            });
        });

    } else {
        console.error("Hamburger menu elements not found.");
    }
};


// --- Local File Save/Load ---
const saveLocalDataToFile = () => {
    const data = getRelevantLocalStorageData(); // Use existing function
    if (Object.keys(data).length === 0) {
        setStatus("No data in local storage to save.", "info");
        return;
    }

    const json = JSON.stringify(data, null, 2); // Pretty print JSON
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Simple date string for filename
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `stock_watchlist_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Watchlist data saved to local JSON file.', 'success');
     // menuDropdown.classList.remove('active'); // Already handled by link click listener
};

const loadLocalDataFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json'; // Accept .json extension
    input.style.display = 'none';

    const handleFileLoad = (event) => { // Define handler separately
        const file = event.target.files[0];
        if (!file) {
            // menuDropdown.classList.remove('active'); // Close menu if cancelled - handled below
            cleanupInput();
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedData = JSON.parse(e.target.result);
                if (typeof loadedData !== 'object' || loadedData === null) {
                    throw new Error("File does not contain a valid JSON object.");
                }

                // Basic validation of keys (optional but recommended)
                 const hasAppKeys = Object.keys(loadedData).some(k => k.startsWith(LS_PREFIX_APP));
                 const hasDcfKeys = Object.keys(loadedData).some(k => k.startsWith(LS_PREFIX_DCF));

                 if (!hasAppKeys && !hasDcfKeys) {
                     throw new Error("JSON file does not seem to contain valid watchlist data (missing expected keys).");
                 }


                // Clear existing relevant LS data before loading
                clearRelevantLocalStorageData();

                // Load data into localStorage
                Object.keys(loadedData).forEach(key => {
                    // Only load keys with expected prefixes to avoid loading unrelated data
                     if (key.startsWith(LS_PREFIX_APP) || key.startsWith(LS_PREFIX_DCF)) {
                         // Handle potential data type issues if loading from older files/formats
                         let value = loadedData[key];
                         // Example: Ensure arrays are arrays (if loading very old data)
                         if (key === `${LS_PREFIX_APP}allWatchlists_v1` && typeof value === 'string') {
                            try { value = JSON.parse(value); } catch { /* ignore parse error */ }
                         }
                         localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value); // Store objects as strings
                     } else {
                         console.warn(`Skipping unexpected key from JSON file: ${key}`);
                     }
                });

                 // Reload app state from the newly populated LS
                 // Need to parse the watchlist string back into an object before loadAppData...
                 const storedWatchlists = localStorage.getItem(`${LS_PREFIX_APP}allWatchlists_v1`);
                 if (storedWatchlists) {
                     try {
                         allWatchlists = JSON.parse(storedWatchlists);
                     } catch (parseError) {
                          console.error("Error parsing watchlists from loaded file:", parseError);
                          allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] }; // Reset on error
                          setStatus('Error parsing watchlist data in file.', 'error');
                     }
                 } else {
                     allWatchlists = { [DEFAULT_WATCHLIST_NAME]: [] }; // Reset if missing
                 }

                 loadAppDataFromLocalStorage(); // This should now work correctly
                 setStatus('Watchlists loaded successfully from local file.', 'success');


            } catch (error) {
                console.error('Error processing JSON file:', error);
                setStatus(`Error loading file: ${error.message}`, 'error');
            } finally {
                 // menuDropdown.classList.remove('active'); // Close menu after processing - handled below
                 cleanupInput();
            }
        };
         reader.onerror = (e) => {
             console.error("FileReader error:", e);
             setStatus("Error reading file.", "error");
             // menuDropdown.classList.remove('active'); - handled below
             cleanupInput();
         };

        reader.readAsText(file); // Read the file content
    };

    const cleanupInput = () => {
        input.removeEventListener('change', handleFileLoad);
        document.body.removeChild(input);
        if (menuDropdown.classList.contains('active')) {
             menuDropdown.classList.remove('active'); // Ensure menu closes even on cancel/error
        }
    };

    input.addEventListener('change', handleFileLoad); // Attach listener

    // Add input to body and click, but handle removal in cleanup
    document.body.appendChild(input);
    input.click();

    // If the user cancels the file dialog, the 'change' event won't fire.
    // We need a way to detect cancellation to clean up the input element and close the menu.
    // A common trick is to listen for window focus changes shortly after clicking.
    window.addEventListener('focus', () => {
        // Delay check slightly to allow file dialog to potentially close
        setTimeout(() => {
            // If the input is still in the DOM, it likely means the dialog was cancelled
            if (document.body.contains(input)) {
                 console.log("File dialog likely cancelled by user.");
                 cleanupInput();
            }
        }, 500); // Adjust delay if needed
    }, { once: true }); // Listen only once


    // Do *not* close menu here - let the handlers do it
};


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM Loaded - Watchlist v33+ (Firebase + Reported FCF)");

  // Setup Hamburger Menu interactions
  setupHamburgerMenu();

  // Add Stock Listener
  addButton.addEventListener('click', addStock);
  tickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addStock();
    }
  });

   // Local Save/Load Listeners (prevent default handled inside functions if needed)
   saveLocalBtn.addEventListener('click', (e) => { e.preventDefault(); saveLocalDataToFile(); });
   loadLocalBtn.addEventListener('click', (e) => { e.preventDefault(); loadLocalDataFromFile(); });


  // Firebase Auth Listener (triggers UI updates and potentially data load on login)
  fbAuth.onAuthStateChanged(user => {
    updateLoginUI(user); // Handles button visibility too
    if (user) {
      // User logged in - consider auto-loading their data?
       console.log("User logged in, attempting to load from Firebase:", user.uid);
       loadDataFromFirebase(); // Auto-load from Firebase on login/page refresh
      // setStatus(`Logged in as ${user.displayName || user.email}. Loading cloud data...`, 'info'); // Status set within loadData...

    } else {
      // User logged out
      console.log("User logged out.");
      // When logged out, the app should reflect local storage state.
      // If local storage was cleared by a Firebase load, then login failed/cancelled,
      // it might be empty. loadAppDataFromLocalStorage() ensures *something* is loaded (even defaults).
      // We call it here to ensure the UI reflects the non-logged-in (local) state.
       loadAppDataFromLocalStorage();
    }
  });

   // Firebase Action Button Listeners
   loginGoogleBtn.addEventListener('click', (e) => { e.preventDefault(); signInWithGoogle(); });
   logoutGoogleBtn.addEventListener('click', (e) => { e.preventDefault(); signOutGoogle(); });
   saveFirebaseBtn.addEventListener('click', (e) => { e.preventDefault(); saveDataToFirebase(); });
   loadFirebaseBtn.addEventListener('click', (e) => { e.preventDefault(); loadDataFromFirebase(); });


  // Load initial data (will load from LS by default, then potentially overwritten by Firebase auth listener)
  // loadAppDataFromLocalStorage(); // Called within the auth listener now

  // Initial API Key Check
  if (!apiKey || apiKey.length < 10 || !apiKey.startsWith("cvi")) {
    setStatus("Finnhub API Key missing or invalid. Stock data fetching will fail.", "error", 0);
  }
   // Firebase Init Check
   if (typeof firebase === 'undefined' || !firebase.app()) {
       setStatus("Firebase failed to initialize. Cloud features unavailable.", "error", 0);
       // Disable cloud buttons if Firebase isn't working (handled by updateLoginUI based on user state)
       // loginGoogleBtn.style.display = 'none'; // Let updateLoginUI handle this
       // saveFirebaseBtn.style.display = 'none';
       // loadFirebaseBtn.style.display = 'none';
       updateLoginUI(null); // Explicitly set to logged-out state if Firebase fails
   }

});