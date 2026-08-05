import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  Download, 
  X, 
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  Edit3,
  TrendingUp,
  LogOut,
  Clock
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Fallback to localhost, editable for production
const API_BASE = import.meta.env.VITE_API_BASE || (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' || 
  window.location.hostname === '[::1]' ||
  window.location.port === '5173'
    ? 'http://localhost:5000/api'
    : '/api'
);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];

// TypeScript Interface declarations
interface CostItem {
  _id: string;
  name: string;
  payee?: string;
  amount: number;
  note?: string;
  mode?: string;
  isRecurring?: boolean;
  date: string;
}

interface Category {
  _id: string;
  name: string;
  budgetLimit?: number;
  items: CostItem[];
}

interface Income {
  _id: string;
  source: string;
  amount: number;
  mode?: string;
  date: string;
}

interface MonthLedger {
  _id?: string;
  year: number;
  month: string;
  categories: Category[];
  income?: Income[];
  isVirtual?: boolean;
}

interface BankHistory {
  _id?: string;
  amount: number;
  updatedAt: string;
}

interface Bank {
  _id: string;
  bankName: 'HDFC' | 'SBI' | 'Kotak' | 'Cash';
  currentAmount: number;
  lastUpdated: string;
  history: BankHistory[];
}

interface ItemInput {
  name: string;
  payee?: string;
  amount: string;
  note: string;
  mode?: string;
  isRecurring?: boolean;
  date?: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  // State variables
  const [year, setYear] = useState<number>(2026);
  const [currency, setCurrency] = useState<string>('₹');
  const [ledgers, setLedgers] = useState<MonthLedger[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState<boolean>(false);
  const [showTimelineView, setShowTimelineView] = useState<boolean>(false);
  
  // Auth state hooks
  const [token, setToken] = useState<string | null>(localStorage.getItem('paisa_ledger_token'));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!token);
  const [hasAccounts, setHasAccounts] = useState<boolean>(true);
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  
  // UI Accordion sets
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [openBankHistories, setOpenBankHistories] = useState<Set<string>>(new Set());
  
  // Interactive inputs
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [itemInputs, setItemInputs] = useState<Record<string, Partial<ItemInput>>>({}); 
  const [bankUpdateInputs, setBankUpdateInputs] = useState<Record<string, string>>({}); 
  const [editingBank, setEditingBank] = useState<string | null>(null); 
  const [isEditingCash, setIsEditingCash] = useState<boolean>(false);
  const [cashInput, setCashInput] = useState<string>(''); 
  const [editingBudgetCategory, setEditingBudgetCategory] = useState<string | null>(null);
  const [budgetLimitInput, setBudgetLimitInput] = useState<string>('');
  const [incomeSourceInput, setIncomeSourceInput] = useState<string>('');
  const [incomeAmountInput, setIncomeAmountInput] = useState<string>(''); 
  const [incomeModeInput, setIncomeModeInput] = useState<string>('Cash');
  const [smsInput, setSmsInput] = useState<string>('');
  const [parsedSmsData, setParsedSmsData] = useState<{ amount: string; payee: string; mode: string; categoryId: string } | null>(null); 
  
  const [loading, setLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [backendOnline, setBackendOnline] = useState<'checking' | 'online' | 'offline'>('checking');

  // Show status popup alerts
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Session expired cleaner
  const handleAuthSessionExpired = () => {
    localStorage.removeItem('paisa_ledger_token');
    setToken(null);
    setIsAuthenticated(false);
    showToast('Session expired. Please login again.', 'error');
  };

  // Check auth status (if users exist in DB)
  const checkAuthStatus = async () => {
    try {
      const res = await fetch(`${API_BASE.replace('/api', '')}/api/auth/status`);
      if (res.ok) {
        const data = await res.json();
        setHasAccounts(data.hasAccounts);
      }
    } catch (e) {
      console.error('Error checking backend auth status:', e);
    }
  };

  // Submit credentials (login / register)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      showToast('Please enter both username and password', 'error');
      return;
    }
    setAuthLoading(true);
    const endpoint = hasAccounts ? 'login' : 'register';
    try {
      const res = await fetch(`${API_BASE.replace('/api', '')}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername.trim(), password: authPassword.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      localStorage.setItem('paisa_ledger_token', data.token);
      setToken(data.token);
      setIsAuthenticated(true);
      showToast(hasAccounts ? 'Welcome back!' : 'Account registered and logged in!');
      setAuthUsername('');
      setAuthPassword('');
      checkAuthStatus();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('paisa_ledger_token');
    setToken(null);
    setIsAuthenticated(false);
    showToast('Logged out successfully.');
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const authHeaders = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const mergedOptions = {
      ...options,
      headers: {
        ...authHeaders,
        ...options.headers
      }
    };
    const res = await fetch(url, mergedOptions);
    if (res.status === 401) {
      handleAuthSessionExpired();
      throw new Error('Session expired');
    }
    return res;
  };

  // Check health of backend server
  const checkBackend = async () => {
    try {
      const res = await fetch(`${API_BASE.replace('/api', '')}/health`);
      if (res.ok) {
        setBackendOnline('online');
      } else {
        setBackendOnline('offline');
      }
    } catch (e) {
      setBackendOnline('offline');
    }
  };

  // Fetch all monthly ledgers for the active year
  const fetchLedgers = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger?year=${year}`);
      const data = await res.json();
      setLedgers(data.ledgers);
    } catch (err) {
      console.error(err);
      showToast('Error loading monthly ledgers', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch HDFC, SBI, Kotak banking records
  const fetchBanks = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/bank`);
      const data = await res.json();
      setBanks(data);
    } catch (err) {
      console.error(err);
      showToast('Error loading bank balances', 'error');
    }
  };

  useEffect(() => {
    checkBackend();
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBanks();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchLedgers();
    }
  }, [isAuthenticated, year]);

  // Toggle categories expansion
  const toggleCategory = (categoryId: string) => {
    const next = new Set(openCategories);
    if (next.has(categoryId)) {
      next.delete(categoryId);
    } else {
      next.add(categoryId);
    }
    setOpenCategories(next);
  };

  // Toggle bank historical ledger view
  const toggleBankHistory = (bankName: string) => {
    const next = new Set(openBankHistories);
    if (next.has(bankName)) {
      next.delete(bankName);
    } else {
      next.add(bankName);
    }
    setOpenBankHistories(next);
  };

  // Create new spending Category in month
  const handleAddCategory = async (monthName: string) => {
    if (!newCategoryName.trim()) {
      showToast('Category name cannot be empty', 'error');
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/category`, {
        method: 'POST',
        body: JSON.stringify({
          year,
          month: monthName,
          name: newCategoryName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add category');
      
      showToast('Category added successfully');
      setNewCategoryName('');
      fetchLedgers();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Delete Category from month
  const handleDeleteCategory = async (monthName: string, categoryId: string) => {
    if (!window.confirm('Delete this category and all its logged items?')) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/category`, {
        method: 'DELETE',
        body: JSON.stringify({ year, month: monthName, categoryId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete category');
      
      showToast('Category deleted');
      fetchLedgers();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Create new Cost Item inside Category
  const handleAddItem = async (monthName: string, categoryId: string) => {
    const inputs = itemInputs[categoryId] || {};
    if (!inputs.name?.trim() || !inputs.amount) {
      showToast('Item Name and Cost are required', 'error');
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/item`, {
        method: 'POST',
        body: JSON.stringify({
          year,
          month: monthName,
          categoryId,
          name: inputs.name.trim(),
          payee: inputs.payee?.trim() || '',
          amount: parseFloat(inputs.amount),
          note: inputs.note?.trim() || '',
          mode: inputs.mode || 'UPI',
          isRecurring: !!inputs.isRecurring,
          date: inputs.date ? new Date(inputs.date) : new Date()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add item');

      showToast('Item logged successfully');
      // Clear inputs
      setItemInputs(prev => ({
        ...prev,
        [categoryId]: { name: '', payee: '', amount: '', note: '', mode: 'UPI', isRecurring: false, date: '' }
      }));
      // Keep accordion open for this category
      const next = new Set(openCategories);
      next.add(categoryId);
      setOpenCategories(next);

      fetchLedgers();
      fetchBanks();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Set/Update Category budget limit
  const handleUpdateCategoryBudget = async (monthName: string, categoryId: string) => {
    if (budgetLimitInput === '') return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/category/budget`, {
        method: 'POST',
        body: JSON.stringify({
          year,
          month: monthName,
          categoryId,
          budgetLimit: parseFloat(budgetLimitInput) || 0
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update budget limit');

      showToast('Budget limit updated successfully');
      setEditingBudgetCategory(null);
      setBudgetLimitInput('');
      fetchLedgers();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Log Monthly Income
  const handleLogIncome = async (monthName: string) => {
    if (!incomeSourceInput.trim() || !incomeAmountInput) {
      showToast('Income Source and Amount are required', 'error');
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/income`, {
        method: 'POST',
        body: JSON.stringify({
          year,
          month: monthName,
          source: incomeSourceInput.trim(),
          amount: parseFloat(incomeAmountInput),
          mode: incomeModeInput
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log income');

      showToast('Income logged successfully');
      setIncomeSourceInput('');
      setIncomeAmountInput('');
      fetchLedgers();
      fetchBanks();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Delete logged income source
  const handleDeleteIncome = async (monthName: string, incomeId: string) => {
    if (!window.confirm('Remove this income entry?')) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/income`, {
        method: 'DELETE',
        body: JSON.stringify({
          year,
          month: monthName,
          incomeId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete income');

      showToast('Income entry removed');
      fetchLedgers();
      fetchBanks();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // SMS Parsing logic utilities
  const parseUPISMS = (text: string) => {
    if (!text) return null;
    
    // Amount matcher (e.g. Rs 450, Rs.450.00, INR 1200, Amt: 100)
    const amountRegex = /(?:rs\.?|inr|amt:?)\s*([\d,]+(?:\.\d{1,2})?)/i;
    const amountMatch = text.match(amountRegex);
    let amount = '';
    if (amountMatch) {
      amount = amountMatch[1].replace(/,/g, '');
    }
    
    // Payee matcher (looks for 'to XYZ', 'paid to XYZ', 'transferred to XYZ' stopping at ref/on/via/upi etc.)
    const payeeRegex = /(?:to|vpa|sent\s+to|paid\s+to|transfer(?:red)?\s+to|debited\s+to|spent\s+at)\s+([A-Za-z0-9\s\.\&\@\-\_]+?)(?=\s+ref|\s+on|\s+via|\s+upi|\s+a\/c|\s+balance|\s+limit|\s+using|\s+txn|\s+transaction|$)/i;
    const payeeMatch = text.match(payeeRegex);
    let payee = '';
    if (payeeMatch) {
      payee = payeeMatch[1].trim();
    }
    
    // Mode matcher
    let mode = 'UPI';
    if (/card/i.test(text) || /swipe/i.test(text)) {
      mode = 'Card';
    } else if (/cash/i.test(text)) {
      mode = 'Cash';
    } else if (/hdfc/i.test(text)) {
      mode = 'HDFC';
    } else if (/sbi/i.test(text)) {
      mode = 'SBI';
    } else if (/kotak/i.test(text)) {
      mode = 'Kotak';
    }
    
    return { amount, payee, mode };
  };

  const autoSelectCategory = (payee: string, categories: Category[]) => {
    if (!payee || !categories || categories.length === 0) return '';
    const lowerPayee = payee.toLowerCase();
    
    const foodKeywords = ['zomato', 'swiggy', 'food', 'restaurant', 'mcdonalds', 'dominos', 'burger', 'lunch', 'dinner', 'cafe'];
    const smokeKeywords = ['cigarette', 'paan', 'cigar', 'smoke', 'tobacco', 'pan'];
    const groceryKeywords = ['blinkit', 'zepto', 'grocery', 'kirana', 'dmart', 'supermarket', 'instamart', 'milk'];
    
    let matchedKeyword = '';
    if (foodKeywords.some(kw => lowerPayee.includes(kw))) matchedKeyword = 'food';
    else if (smokeKeywords.some(kw => lowerPayee.includes(kw))) matchedKeyword = 'cigarette';
    else if (groceryKeywords.some(kw => lowerPayee.includes(kw))) matchedKeyword = 'blinkit';
    
    const matchedCat = categories.find(cat => {
      const nameLower = cat.name.toLowerCase();
      if (matchedKeyword && nameLower.includes(matchedKeyword)) return true;
      return lowerPayee.includes(nameLower) || nameLower.includes(lowerPayee);
    });
    
    return matchedCat ? matchedCat._id : categories[0]?._id || '';
  };

  // Log Item parsed from SMS
  const handleLogParsedSMS = async (monthName: string) => {
    if (!parsedSmsData || !parsedSmsData.amount || !parsedSmsData.payee || !parsedSmsData.categoryId) {
      showToast('Parsed transaction data is incomplete', 'error');
      return;
    }
    
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/item`, {
        method: 'POST',
        body: JSON.stringify({
          year,
          month: monthName,
          categoryId: parsedSmsData.categoryId,
          name: parsedSmsData.payee,
          payee: parsedSmsData.payee,
          amount: parseFloat(parsedSmsData.amount),
          note: 'Parsed from SMS',
          mode: parsedSmsData.mode || 'UPI',
          isRecurring: false,
          date: new Date()
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log transaction from SMS');
      
      showToast('Transaction parsed & logged successfully!');
      setSmsInput('');
      setParsedSmsData(null);
      fetchLedgers();
      fetchBanks();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Delete specific Cost Item
  const handleDeleteItem = async (monthName: string, categoryId: string, itemId: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/ledger/item`, {
        method: 'DELETE',
        body: JSON.stringify({ year, month: monthName, categoryId, itemId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete item');
      
      showToast('Item deleted');
      fetchLedgers();
      fetchBanks();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Update bank current amount (archiving old to history)
  const handleUpdateBank = async (bankName: string, overrideAmount?: string) => {
    const amtStr = overrideAmount !== undefined ? overrideAmount : bankUpdateInputs[bankName];
    if (amtStr === undefined || amtStr.trim() === '') {
      showToast('Please specify a balance amount', 'error');
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE}/bank/update`, {
        method: 'POST',
        body: JSON.stringify({
          bankName,
          amount: parseFloat(amtStr)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update balance');

      showToast(`${bankName} balance updated!`);
      setBankUpdateInputs(prev => ({ ...prev, [bankName]: '' }));
      fetchBanks();
    } catch (err: any) {
      showToast(err.message || 'Error occurred', 'error');
    }
  };

  // Helper: Get difference from last bank update
  const getBankDiff = (bank: Bank) => {
    if (!bank.history || bank.history.length === 0) return null;
    const lastHistoryItem = bank.history[bank.history.length - 1];
    return bank.currentAmount - lastHistoryItem.amount;
  };

  // Helper: Get sum of expenses inside month ledger
  const getMonthTotal = (monthLedger: MonthLedger) => {
    if (!monthLedger || !monthLedger.categories) return 0;
    return monthLedger.categories.reduce((sum, cat) => {
      return sum + cat.items.reduce((cSum, item) => cSum + item.amount, 0);
    }, 0);
  };

  // Helper: Group all transactions date-wise for Timeline View
  const getTimelineGroups = (ledger: MonthLedger) => {
    const list: any[] = [];
    
    // 1. Gather all expense items
    if (ledger && ledger.categories) {
      ledger.categories.forEach(cat => {
        if (cat.items) {
          cat.items.forEach(item => {
            list.push({
              ...item,
              type: 'expense',
              categoryName: cat.name,
              categoryId: cat._id
            });
          });
        }
      });
    }

    // 2. Gather all incomes
    if (ledger && ledger.income) {
      ledger.income.forEach(inc => {
        list.push({
          ...inc,
          type: 'income',
          name: inc.source,
          categoryName: 'Income'
        });
      });
    }

    // 3. Sort by date descending
    list.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // 4. Group by date string
    const groups: Record<string, any[]> = {};
    list.forEach(item => {
      const d = item.date ? new Date(item.date) : new Date();
      const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(item);
    });

    return groups;
  };

  // Helper: Get summary metrics for the entire year
  const getYearlyMetrics = () => {
    let yearTotal = 0;
    let heaviestVal = 0;
    let heaviestMonthName = 'None';

    ledgers.forEach(m => {
      const mTotal = getMonthTotal(m);
      yearTotal += mTotal;
      if (mTotal > heaviestVal) {
        heaviestVal = mTotal;
        heaviestMonthName = m.month;
      }
    });

    return { yearTotal, heaviestMonthName };
  };

  const { yearTotal, heaviestMonthName } = getYearlyMetrics();

  // Helper: Calculate total assets across HDFC, SBI, Kotak
  const getTotalBankBalance = () => {
    return banks.reduce((sum, b) => sum + b.currentAmount, 0);
  };

  // Download PDF statement for a specific month
  const handleDownloadPDF = (monthLedger: MonthLedger) => {
    const total = getMonthTotal(monthLedger);
    const doc = new jsPDF();
    
    // Header Style matching Obsidian design (Warm Dark background band)
    doc.setFillColor(20, 20, 22);
    doc.rect(0, 0, 210, 35, 'F');
    
    doc.setTextColor(229, 193, 88); // Gold text
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(`PAISA LEDGER`, 15, 18);
    
    doc.setTextColor(200, 200, 200);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Statement Period: ${monthLedger.month} ${year}`, 15, 27);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 145, 27);

    // Section 1: Financial Overview cards/table
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(13);
    doc.setFont('Helvetica', 'bold');
    doc.text("1. Month Expense Overview", 15, 48);

    autoTable(doc, {
      startY: 53,
      head: [['Summary Item', 'Amount']],
      body: [
        [`Total Spends (${monthLedger.month})`, `${currency} ${total.toFixed(2)}`],
        ['Active Categories Logged', `${monthLedger.categories.length} Categories`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [20, 20, 22], textColor: [229, 193, 88] },
      styles: { fontSize: 10 }
    });

    // Section 2: Category Breakdown Table
    let nextY = (doc as any).lastAutoTable.finalY + 15;
    doc.text("2. Category-wise Breakdown", 15, nextY);

    const catRows = monthLedger.categories.map(cat => {
      const cTotal = cat.items.reduce((s, it) => s + it.amount, 0);
      const percentage = total > 0 ? (cTotal / total) * 100 : 0;
      return [
        cat.name,
        `${cat.items.length} Items`,
        `${percentage.toFixed(0)}%`,
        `${currency} ${cTotal.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: nextY + 5,
      head: [['Category Name', 'Logged Items', 'Share (%)', 'Total Value']],
      body: catRows.length > 0 ? catRows : [['No categories logged', '-', '-', `${currency} 0.00`]],
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 44], textColor: [229, 193, 88] },
      styles: { fontSize: 10 }
    });

    // Section 3: Detailed Ledger List
    nextY = (doc as any).lastAutoTable.finalY + 15;
    if (nextY > 230) {
      doc.addPage();
      nextY = 20;
    }
    doc.text("3. Detailed Spending Item Logs", 15, nextY);

    const detailedRows: any[] = [];
    monthLedger.categories.forEach(cat => {
      cat.items.forEach(item => {
        detailedRows.push([
          new Date(item.date).toLocaleDateString(),
          cat.name,
          item.name + (item.isRecurring ? ' [Recurring]' : ''),
          item.payee || '-',
          item.note || '-',
          item.mode || 'UPI',
          `${currency} ${item.amount.toFixed(2)}`
        ]);
      });
    });

    autoTable(doc, {
      startY: nextY + 5,
      head: [['Date', 'Category', 'Item Name', 'Payee', 'Note', 'Mode', 'Cost']],
      body: detailedRows.length > 0 ? detailedRows : [['-', '-', 'No item costs recorded', '-', '-', '-', '-']],
      theme: 'striped',
      headStyles: { fillColor: [20, 20, 22], textColor: [229, 193, 88] },
      styles: { fontSize: 8.5 }
    });

    doc.save(`PaisaLedger_${monthLedger.month}_${year}_Statement.pdf`);
    showToast('Monthly PDF statement downloaded successfully!');
  };

  // Export monthly spending data to CSV
  const handleExportMonthCSV = (monthLedger: MonthLedger) => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Category Name,Item Name,Payee,Amount,Note,Mode,Recurring,Date\n';

    monthLedger.categories.forEach(cat => {
      cat.items.forEach(item => {
        const cleanName = item.name.replace(/"/g, '""');
        const cleanPayee = (item.payee || '').replace(/"/g, '""');
        const cleanNote = (item.note || '').replace(/"/g, '""');
        const formattedDate = new Date(item.date).toLocaleDateString();
        csvContent += `"${cat.name}","${cleanName}","${cleanPayee}",${item.amount},"${cleanNote}","${item.mode || 'UPI'}",${!!item.isRecurring},${formattedDate}\n`;
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PaisaLedger_${monthLedger.month}_${year}_Expenses.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Expenses CSV file downloaded!');
  };

  // Export current bank balances & history to CSV
  const handleExportBanksCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Bank Name,Amount,Date Updated,Status\n';

    banks.forEach(bank => {
      // Add current state
      csvContent += `"${bank.bankName}",${bank.currentAmount},"${new Date(bank.lastUpdated).toLocaleString()}",Current\n`;
      // Add history items
      if (bank.history) {
        bank.history.forEach(h => {
          csvContent += `"${bank.bankName}",${h.amount},"${new Date(h.updatedAt).toLocaleString()}",Historical\n`;
        });
      }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PaisaLedger_Bank_Balances_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Bank ledger history exported to CSV!');
  };

  // Slice months into pairs (rows of 2 months) to expand the details inline nicely in the grid
  const monthPairs: MonthLedger[][] = [];
  for (let i = 0; i < ledgers.length; i += 2) {
    monthPairs.push(ledgers.slice(i, i + 2));
  }
  // Compile trend data for the visual charts
  const getTrendData = () => {
    let currentVal = getTotalBankBalance(); // August ending net assets (current snap)
    
    // Map month names to ledgers
    const ledgerMap: { [key: string]: MonthLedger } = {};
    ledgers.forEach(l => {
      ledgerMap[l.month] = l;
    });
    
    const trendPoints = MONTH_NAMES.map(mName => {
      const ledger = ledgerMap[mName] || { categories: [], income: [] };
      const spend = getMonthTotal(ledger);
      const incomeList = ledger.income || [];
      const income = incomeList.reduce((sum, inc) => sum + inc.amount, 0);
      const netSavings = income - spend;
      const savingsRate = income > 0 ? (netSavings / income) * 100 : 0;
      
      return {
        month: mName,
        spend,
        income,
        netSavings,
        savingsRate
      };
    });
    
    // Project Net Worth backward/forward
    const currentMonthName = MONTH_NAMES[new Date().getMonth()];
    let latestActiveIdx = MONTH_NAMES.indexOf(currentMonthName);
    if (latestActiveIdx === -1) latestActiveIdx = 11;
    
    const netWorths = new Array(12).fill(0);
    netWorths[latestActiveIdx] = currentVal;
    
    // Walk backwards
    for (let i = latestActiveIdx - 1; i >= 0; i--) {
      const nextMonthSavings = trendPoints[i + 1].netSavings;
      currentVal = currentVal - nextMonthSavings;
      netWorths[i] = currentVal;
    }
    
    // Walk forwards
    currentVal = getTotalBankBalance();
    for (let i = latestActiveIdx + 1; i < 12; i++) {
      const currentMonthSavings = trendPoints[i].netSavings;
      currentVal = currentVal + currentMonthSavings;
      netWorths[i] = currentVal;
    }
    
    const fullData = trendPoints.map((pt, idx) => ({
      ...pt,
      netWorth: netWorths[idx],
      label: pt.month.substring(0, 3)
    }));
    
    const startIdx = Math.max(0, latestActiveIdx - 5);
    return fullData.slice(startIdx, latestActiveIdx + 1);
  };

  const trendData = getTrendData();
  
  // Calculate top spending categories for the currently active ledger
  const activeMonthName = expandedMonth || MONTH_NAMES[new Date().getMonth()] || MONTH_NAMES[0];
  const activeLedger = ledgers.find(l => l.month === activeMonthName) || ledgers.find(l => l.month === MONTH_NAMES[new Date().getMonth()]) || ledgers[0];
  const allCategorySpends: { name: string; total: number }[] = [];
  if (activeLedger && activeLedger.categories) {
    activeLedger.categories.forEach(cat => {
      const total = cat.items.reduce((sum, item) => sum + item.amount, 0);
      allCategorySpends.push({ name: cat.name, total });
    });
  }
  const topCategories = allCategorySpends.sort((a,b) => b.total - a.total).slice(0, 3);
  const maxCatSpend = topCategories[0]?.total || 1;
  
  // Compare latest month vs previous month for MoM insights
  const latestPt = trendData[trendData.length - 1];
  const prevPt = trendData[trendData.length - 2];
  
  let momSpendText = 'No comparative spending data available.';
  let momSavingsText = 'Add income details to compile savings rate.';
  
  if (latestPt && prevPt) {
    const spendDiff = latestPt.spend - prevPt.spend;
    if (prevPt.spend > 0) {
      const spendPercent = (spendDiff / prevPt.spend) * 100;
      momSpendText = spendDiff >= 0 
        ? `Your spending increased by ${spendPercent.toFixed(0)}% compared to ${prevPt.month}.`
        : `Great job! Your spending decreased by ${Math.abs(spendPercent).toFixed(0)}% compared to ${prevPt.month}.`;
    } else {
      momSpendText = `Logged spending of ${currency} ${latestPt.spend.toLocaleString('en-IN')} in ${latestPt.month}.`;
    }
    
    if (latestPt.income > 0) {
      momSavingsText = `Logged a healthy ${latestPt.savingsRate.toFixed(0)}% savings rate in ${latestPt.month} (Net: +${currency} ${latestPt.netSavings.toLocaleString('en-IN')}).`;
    }
  }
  // SVG Charting Constants
  const chartWidth = 400;
  const chartHeight = 150;
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 20;
  const activeW = chartWidth - paddingLeft - paddingRight;
  const activeH = chartHeight - paddingTop - paddingBottom;
  
  const getX = (idx: number) => paddingLeft + (idx / (trendData.length - 1)) * activeW;
  
  // Spend and Income max value
  const maxVal = Math.max(...trendData.map(d => Math.max(d.income, d.spend)), 1000);
  const getY = (val: number) => chartHeight - paddingBottom - (val / maxVal) * activeH;

  // Path for Income (Green)
  const incomePoints = trendData.map((d, i) => `${getX(i)},${getY(d.income)}`).join(' ');
  const incomePath = `M ${incomePoints}`;
  const incomeArea = trendData.length > 0 ? `${incomePath} L ${getX(trendData.length - 1)},${chartHeight - paddingBottom} L ${getX(0)},${chartHeight - paddingBottom} Z` : '';
  
  // Path for Spend (Gold)
  const spendPoints = trendData.map((d, i) => `${getX(i)},${getY(d.spend)}`).join(' ');
  const spendPath = `M ${spendPoints}`;
  const spendArea = trendData.length > 0 ? `${spendPath} L ${getX(trendData.length - 1)},${chartHeight - paddingBottom} L ${getX(0)},${chartHeight - paddingBottom} Z` : '';

  // 2. Net Worth Trend
  const nwVals = trendData.map(d => d.netWorth);
  const minNW = Math.min(...nwVals);
  const maxNW = Math.max(...nwVals);
  const nwDiff = maxNW - minNW === 0 ? 1000 : maxNW - minNW;
  
  const nwMinY = minNW - nwDiff * 0.1;
  const nwMaxY = maxNW + nwDiff * 0.1;
  
  const getNwY = (val: number) => chartHeight - paddingBottom - ((val - nwMinY) / (nwMaxY - nwMinY)) * activeH;
  const nwPoints = trendData.map((d, i) => `${getX(i)},${getNwY(d.netWorth)}`).join(' ');
  const nwPath = `M ${nwPoints}`;

  if (!isAuthenticated) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1.5rem' }}>
        {toast && (
          <div className={`alert-toast toast-${toast.type}`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span>{toast.message}</span>
          </div>
        )}
        
        <div className="month-card" style={{ maxWidth: '400px', width: '100%', cursor: 'default', padding: '2rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p className="paisa-ledger-tag" style={{ letterSpacing: '2px', fontSize: '0.75rem', marginBottom: '0.25rem' }}>PAISA LEDGER</p>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent-gold)', margin: 0, fontSize: '1.5rem' }}>
              {hasAccounts ? 'Sign In' : 'Set Up Account'}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              {hasAccounts 
                ? 'Enter your credentials to access your financial nodes.'
                : 'Create your primary administrator credentials to get started.'}
            </p>
          </div>
          
          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Username</label>
              <input 
                type="text"
                className="form-input"
                required
                placeholder="e.g. karan"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                autoFocus
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
              <input 
                type="password"
                className="form-input"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>
            
            <button 
              type="submit" 
              className="btn-add-item" 
              style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', fontWeight: 600 }}
              disabled={authLoading}
            >
              {authLoading ? 'Verifying...' : (hasAccounts ? 'Log In' : 'Create & Access')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Pop Alerts Notification */}
      {toast && (
        <div className={`alert-toast toast-${toast.type}`}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header section matching images */}
      <div className="header-section">
        <p className="paisa-ledger-tag">PAISA LEDGER</p>
        <h1 className="title-text">
          Where did your money <span>actually</span> go?
        </h1>
        <p className="description-text">
          One node per month. Open a month, make your own categories, drop items inside with what they cost.
          Totals add up on their own — download any month as a PDF and ask an AI about it.
        </p>
      </div>

      {/* Toolbar / Configuration */}
      <div className="controls-bar">
        <div className="control-item">
          <button className="year-btn" onClick={() => setYear(y => y - 1)}>&lt;</button>
          <strong>{year}</strong>
          <button className="year-btn" onClick={() => setYear(y => y + 1)}>&gt;</button>
        </div>

        <div className="control-item">
          <span>Currency</span>
          <select 
            className="currency-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="₹">₹ (INR)</option>
            <option value="$">$ (USD)</option>
            <option value="€">€ (EUR)</option>
            <option value="£">£ (GBP)</option>
          </select>
        </div>

        {backendOnline !== 'online' && (
          <div className="control-item" style={{ borderColor: 'var(--debit-red)', color: 'var(--debit-red)' }}>
            <AlertCircle size={14} />
            <span style={{ fontSize: '0.8rem' }}>Server offline</span>
          </div>
        )}

        {loading && (
          <div className="control-item" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
            <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span className="loading-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }}></span>
              Loading...
            </span>
          </div>
        )}

        {/* Logout Button */}
        <div className="control-item" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          <button 
            onClick={handleLogout}
            className="btn" 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.35rem', 
              padding: '0.4rem 0.75rem', 
              fontSize: '0.8rem', 
              background: 'rgba(239, 68, 68, 0.08)', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              color: '#ef4444',
              borderRadius: '6px',
              cursor: 'pointer',
              height: '32px'
            }}
            title="Log Out"
          >
            <LogOut size={13} />
            Logout
          </button>
        </div>
      </div>

      {/* High-level yearly metric overview */}
      <div className="stats-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="stat-tag">
          Year total: <strong>{currency} {yearTotal.toLocaleString('en-IN')}</strong>
        </div>
        <div className="stat-tag">
          Heaviest month: <strong style={{ color: '#10b981' }}>{heaviestMonthName}</strong>
        </div>
        <button 
          onClick={() => setShowDashboard(!showDashboard)}
          className="btn"
          style={{ 
            padding: '0.35rem 0.75rem', 
            fontSize: '0.8rem', 
            borderRadius: '20px', 
            background: showDashboard ? 'rgba(229, 193, 88, 0.12)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${showDashboard ? 'var(--accent-gold)' : 'rgba(255, 255, 255, 0.08)'}`,
            color: showDashboard ? 'var(--accent-gold)' : 'var(--text-primary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            transition: 'all 0.2s ease',
            height: '28px'
          }}
        >
          <TrendingUp size={12} />
          {showDashboard ? 'Hide Insights' : 'Trends & Insights'}
        </button>
      </div>

      {/* Compact Bank Balance Card (exactly same width/borders as month cards, placed at the top) */}
      <div 
        className="month-card"
        style={{ 
          maxWidth: '440px', 
          margin: '0 auto 2.5rem auto', 
          width: '100%', 
          cursor: 'default',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div className="month-header" style={{ marginBottom: '0.25rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span className="month-name" style={{ fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>Bank Balances</span>
            
            {/* Compact Cash Entry in the header parallel to the title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ opacity: 0.8 }}>Cash:</span>
              {isEditingCash ? (
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ width: '80px', padding: '0.1rem 0.3rem', fontSize: '0.75rem', background: '#09090b', height: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    placeholder="Amount"
                  />
                  <button 
                    className="btn-add-item" 
                    style={{ padding: '0.1rem 0.3rem', fontSize: '0.75rem', width: 'auto' }}
                    onClick={async () => {
                      await handleUpdateBank('Cash', cashInput);
                      setIsEditingCash(false);
                    }}
                  >
                    Save
                  </button>
                  <button 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: '0.1rem' }}
                    onClick={() => setIsEditingCash(false)}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                (() => {
                  const cashBank = banks.find(b => b.bankName === 'Cash');
                  const cashAmount = cashBank ? cashBank.currentAmount : 0;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <strong style={{ color: 'var(--accent-gold)' }}>
                        {currency} {cashAmount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                      </strong>
                      <button 
                        onClick={() => {
                          setIsEditingCash(true);
                          setCashInput(cashAmount.toString());
                        }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.1rem' }}
                        title="Edit cash balance"
                      >
                        <Edit3 size={11} />
                      </button>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
          
          <button 
            onClick={handleExportBanksCSV} 
            className="category-delete-btn" 
            title="Export CSV"
            style={{ padding: 0 }}
          >
            <FileSpreadsheet size={16} color="var(--accent-gold)" />
          </button>
        </div>
        
        {/* Total Assets Balance */}
        <div style={{ fontSize: '1.7rem', color: 'var(--accent-gold)', fontWeight: 700, fontFamily: 'var(--font-serif)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
          {currency} {getTotalBankBalance().toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>

        {/* Compact Banks List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {banks.filter(b => b.bankName !== 'Cash').map(bank => {
            const diff = getBankDiff(bank);
            const isHistoryOpen = openBankHistories.has(bank.bankName);
            const isEditing = editingBank === bank.bankName;

            return (
              <div key={bank._id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  
                  {/* Bank Name and Click to Expand History */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span 
                      style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline', color: 'var(--text-primary)' }} 
                      onClick={() => toggleBankHistory(bank.bankName)}
                      title="Click to view history logs"
                    >
                      {bank.bankName}
                    </span>
                    {diff !== null && diff !== 0 && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: diff > 0 ? 'var(--credit-green)' : 'var(--debit-red)' }}>
                        ({diff > 0 ? '+' : ''}{diff.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
                      </span>
                    )}
                  </div>

                  {/* Balance and Edit Trigger */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {currency} {bank.currentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <button 
                      onClick={() => {
                        setEditingBank(isEditing ? null : bank.bankName);
                        setBankUpdateInputs(prev => ({ ...prev, [bank.bankName]: bank.currentAmount.toString() }));
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                      title="Edit balance"
                    >
                      <Edit3 size={12} />
                    </button>
                  </div>
                </div>

                {/* Inline Editing Form */}
                {isEditing && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                    <input 
                      type="number" 
                      className="form-input" 
                      style={{ flexGrow: 1, padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#09090b', height: 'auto', border: '1px solid rgba(255,255,255,0.08)' }}
                      value={bankUpdateInputs[bank.bankName] || ''}
                      onChange={(e) => setBankUpdateInputs(prev => ({
                        ...prev,
                        [bank.bankName]: e.target.value
                      }))}
                      placeholder="Amount"
                    />
                    <button 
                      className="btn-add-item" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
                      onClick={() => {
                        handleUpdateBank(bank.bankName);
                        setEditingBank(null);
                      }}
                    >
                      Save
                    </button>
                    <button 
                      style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                      onClick={() => setEditingBank(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Compact Balance History List */}
                {isHistoryOpen && (
                  <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Balance History</div>
                    {(!bank.history || bank.history.length === 0) ? (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No past balances stored yet.</div>
                    ) : (
                      bank.history.slice().reverse().slice(0, 3).map((h, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          <span>{currency} {h.amount.toLocaleString('en-IN')}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{new Date(h.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Trends & Insights Dashboard */}
      {showDashboard && (
        <div className="dashboard-section">
          <h2 className="dashboard-title-main">Trends & Insights</h2>
          
          <div className="dashboard-grid">
            
            {/* Card 1: Income vs Spend Area Chart */}
            <div className="dashboard-card">
              <h3 className="dashboard-card-title">Income vs Spend</h3>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--credit-green)', borderRadius: '50%' }} /> Income
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--accent-gold)', borderRadius: '50%' }} /> Spends
                </span>
              </div>
              
              <div className="chart-container">
                {trendData.length <= 1 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    Insufficient monthly logs to plot spending trends.
                  </div>
                ) : (
                  <svg className="chart-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                    {/* Gradients */}
                    <defs>
                      <linearGradient id="area-grad-gold" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity="0.2"/>
                        <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity="0.0"/>
                      </linearGradient>
                      <linearGradient id="area-grad-green" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--credit-green)" stopOpacity="0.15"/>
                        <stop offset="100%" stopColor="var(--credit-green)" stopOpacity="0.0"/>
                      </linearGradient>
                    </defs>
                    
                    {/* Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                      <line 
                        key={i} 
                        x1={paddingLeft} 
                        y1={paddingTop + ratio * activeH} 
                        x2={chartWidth - paddingRight} 
                        y2={paddingTop + ratio * activeH} 
                        className="chart-grid-line" 
                      />
                    ))}
                    
                    {/* Area Fills */}
                    <path d={incomeArea} className="chart-area-fill-green" />
                    <path d={spendArea} className="chart-area-fill-gold" />
                    
                    {/* Lines */}
                    <path d={incomePath} className="chart-line chart-line-green" />
                    <path d={spendPath} className="chart-line chart-line-gold" />
                    
                    {/* Dots & Labels */}
                    {trendData.map((d, i) => (
                      <g key={i}>
                        <circle cx={getX(i)} cy={getY(d.income)} r="3.5" className="chart-dot chart-dot-green" />
                        <circle cx={getX(i)} cy={getY(d.spend)} r="3.5" className="chart-dot chart-dot-gold" />
                        
                        {/* Month Label */}
                        <text x={getX(i)} y={chartHeight - 4} textAnchor="middle" className="chart-axis-text">
                          {d.label}
                        </text>
                        
                        {/* Y Axis Value Labels */}
                        {i === 0 && (
                          <text x={paddingLeft - 5} y={getY(maxVal) + 3} textAnchor="end" className="chart-axis-text">
                            {currency}{(maxVal / 1000).toFixed(0)}K
                          </text>
                        )}
                      </g>
                    ))}
                  </svg>
                )}
              </div>
            </div>
            
            {/* Card 2: Net Worth Timeline Line Chart */}
            <div className="dashboard-card">
              <h3 className="dashboard-card-title">Net Worth Trend</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Time-series wealth accumulation trend
              </div>
              
              <div className="chart-container">
                {trendData.length <= 1 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    Insufficient monthly logs to plot net worth trend.
                  </div>
                ) : (
                  <svg className="chart-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                    <defs>
                      <filter id="glow-gold-filter" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                      <line 
                        key={i} 
                        x1={paddingLeft} 
                        y1={paddingTop + ratio * activeH} 
                        x2={chartWidth - paddingRight} 
                        y2={paddingTop + ratio * activeH} 
                        className="chart-grid-line" 
                      />
                    ))}

                    {/* Line */}
                    <path d={nwPath} className="chart-line chart-line-gold" style={{ filter: 'url(#glow-gold-filter)' }} />

                    {/* Dots */}
                    {trendData.map((d, i) => (
                      <g key={i}>
                        <circle cx={getX(i)} cy={getNwY(d.netWorth)} r="4" className="chart-dot chart-dot-gold" />
                        
                        <text 
                          x={getX(i)} 
                          y={getNwY(d.netWorth) - 8} 
                          textAnchor="middle" 
                          fill="var(--accent-gold)" 
                          fontSize="8px" 
                          fontWeight="600"
                        >
                          {(d.netWorth / 1000).toFixed(0)}K
                        </text>
                        
                        <text x={getX(i)} y={chartHeight - 4} textAnchor="middle" className="chart-axis-text">
                          {d.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                )}
              </div>
            </div>

            {/* Card 3: Top Spending Categories */}
            <div className="dashboard-card">
              <h3 className="dashboard-card-title">
                Top Categories ({activeMonthName})
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Where your category funds are going
              </div>
              
              <div className="ranking-list">
                {topCategories.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>
                    No category spending records found for this period.
                  </div>
                ) : (
                  topCategories.map((cat, idx) => {
                    const percentage = maxCatSpend > 0 ? (cat.total / maxCatSpend) * 100 : 0;
                    return (
                      <div key={idx} className="ranking-row">
                        <div className="ranking-meta">
                          <span className="ranking-name">{cat.name}</span>
                          <span className="ranking-amount">{currency} {cat.total.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="ranking-bar-bg">
                          <div className="ranking-bar-fill" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Card 4: Financial Summary & MoM Insights */}
            <div className="dashboard-card">
              <h3 className="dashboard-card-title">Financial Insights</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Auto-generated budget insights
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="insight-item">
                  <TrendingUp size={16} className="insight-icon" style={{ color: 'var(--accent-gold)' }} />
                  <div>
                    <strong>Spending Trajectory:</strong> {momSpendText}
                  </div>
                </div>
                
                <div className="insight-item">
                  <CheckCircle size={16} className="insight-icon" style={{ color: 'var(--credit-green)' }} />
                  <div>
                    <strong>Savings Status:</strong> {momSavingsText}
                  </div>
                </div>

                <div className="insight-item">
                  <AlertCircle size={16} className="insight-icon" style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <strong>Net Worth Snapshot:</strong> Your current net worth is <strong>{currency} {getTotalBankBalance().toLocaleString('en-IN')}</strong> across HDFC, SBI, Kotak, and Cash reserves.
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Month Grids (Rendered as rows of pairs for neat full-width details integration) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '3rem' }}>
        {monthPairs.map((pair, rowIndex) => {
          const hasActive = pair.some(m => m.month === expandedMonth);
          // If a month is expanded, hide all rows that don't contain the expanded month
          if (expandedMonth && !hasActive) return null;

          return (
            <React.Fragment key={rowIndex}>
              
              {/* Pairs Grid Row */}
              <div className="months-row-grid" style={expandedMonth ? { gridTemplateColumns: '1fr' } : undefined}>
                {pair.map(monthLedger => {
                  const isSelected = expandedMonth === monthLedger.month;
                  // If a month is expanded, hide other months in the same row
                  if (expandedMonth && !isSelected) return null;

                  const totalSpending = getMonthTotal(monthLedger);
                  const hasTransactions = totalSpending > 0;

                  return (
                    <div 
                      key={monthLedger.month}
                      className={`month-card ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setExpandedMonth(isSelected ? null : monthLedger.month);
                        setShowTimelineView(false);
                      }}
                      style={expandedMonth ? { maxWidth: '440px', margin: '0 auto', width: '100%' } : undefined}
                    >
                      <div className="month-header">
                        <span className="month-name">{monthLedger.month}</span>
                        {hasTransactions && <span className="active-dot" />}
                      </div>
                      <div className="month-amount" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 600 }}>Spent: {currency} {totalSpending.toLocaleString('en-IN')}</span>
                        {(() => {
                          const monthIncomeList = monthLedger.income || [];
                          const monthTotalIncome = monthIncomeList.reduce((sum, inc) => sum + inc.amount, 0);
                          return monthTotalIncome > 0 ? (
                            <span style={{ fontSize: '0.85rem', color: 'var(--credit-green)', fontWeight: 600 }}>
                              Income: +{currency} {monthTotalIncome.toLocaleString('en-IN')}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="month-categories-count" style={{ marginTop: '0.4rem' }}>
                        {monthLedger.categories ? monthLedger.categories.length : 0} CATEGORIES
                      </div>
                    </div>
                  );
                })}
              </div>

            {/* Injected Detailed Panel right under the active grid row */}
            {pair.some(m => m.month === expandedMonth) && (
              (() => {
                const activeLedger = pair.find(m => m.month === expandedMonth);
                if (!activeLedger) return null;
                const activeTotal = getMonthTotal(activeLedger);
                const activeIncomeList = activeLedger.income || [];
                const totalIncome = activeIncomeList.reduce((sum, inc) => sum + inc.amount, 0);
                const netSavings = totalIncome - activeTotal;
                const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

                return (
                  <div className="month-detail-panel">
                    <div className="detail-header">
                      <div>
                        <h2 className="detail-title">{activeLedger.month} {year}</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                          <p className="detail-spending" style={{ margin: 0 }}>
                            Total spending: <strong>{currency} {activeTotal.toLocaleString('en-IN')}</strong>
                          </p>
                          {totalIncome > 0 && (
                            <span className={`savings-badge ${savingsRate < 0 ? 'negative' : ''}`}>
                              Savings Rate: {savingsRate.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="detail-actions">
                        <button className="btn btn-primary" onClick={() => handleDownloadPDF(activeLedger)}>
                          <Download size={14} /> Download PDF
                        </button>
                        <button className="btn" onClick={() => handleExportMonthCSV(activeLedger)}>
                          <FileSpreadsheet size={14} /> Export CSV
                        </button>
                        <button 
                          className="btn" 
                          style={{
                            borderColor: showTimelineView ? 'var(--accent-gold)' : 'rgba(255,255,255,0.08)',
                            color: showTimelineView ? 'var(--accent-gold)' : 'var(--text-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                          onClick={() => setShowTimelineView(!showTimelineView)}
                        >
                          <Clock size={14} /> {showTimelineView ? 'Category View' : 'Daily Timeline'}
                        </button>
                        <button className="btn" onClick={() => { setExpandedMonth(null); setShowTimelineView(false); }}>
                          Close
                        </button>
                      </div>
                    </div>

                    {/* UPI SMS Importer Card */}
                    <div className="sms-parser-card" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-gold)' }}>UPI SMS Importer</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Copy & paste PhonePe / GPay notification</span>
                      </div>
                      
                      <textarea
                        className="sms-textarea"
                        placeholder="Paste transaction SMS alert text here..."
                        value={smsInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSmsInput(val);
                          if (val.trim()) {
                            const parsed = parseUPISMS(val) || { amount: '', payee: '', mode: 'UPI' };
                            const matchedCatId = parsed.payee ? autoSelectCategory(parsed.payee, activeLedger.categories || []) : '';
                            setParsedSmsData({
                              amount: parsed.amount || '',
                              payee: parsed.payee || '',
                              mode: parsed.mode || 'UPI',
                              categoryId: matchedCatId || (activeLedger.categories?.[0]?._id || '')
                            });
                          } else {
                            setParsedSmsData(null);
                          }
                        }}
                      />

                      {parsedSmsData && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--credit-green)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>✓ Parsed Transaction Alert</div>
                          
                          <div className="sms-parsed-row">
                            <div className="sms-parsed-group">
                              <label>Payee</label>
                              <input 
                                type="text"
                                className="sms-parsed-input"
                                value={parsedSmsData.payee}
                                onChange={(e) => setParsedSmsData(prev => prev ? { ...prev, payee: e.target.value } : null)}
                              />
                            </div>
                            
                            <div className="sms-parsed-group">
                              <label>Amount</label>
                              <input 
                                type="number"
                                className="sms-parsed-input"
                                value={parsedSmsData.amount}
                                onChange={(e) => setParsedSmsData(prev => prev ? { ...prev, amount: e.target.value } : null)}
                              />
                            </div>
                            
                            <div className="sms-parsed-group">
                              <label>Mode</label>
                              <select 
                                className="sms-parsed-input"
                                value={parsedSmsData.mode}
                                onChange={(e) => setParsedSmsData(prev => prev ? { ...prev, mode: e.target.value } : null)}
                              >
                                <option value="HDFC">HDFC</option>
                                <option value="SBI">SBI</option>
                                <option value="Kotak">Kotak</option>
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Card">Card</option>
                              </select>
                            </div>

                            <div className="sms-parsed-group" style={{ minWidth: '160px' }}>
                              <label>Target Category</label>
                              <select 
                                className="sms-parsed-input"
                                value={parsedSmsData.categoryId}
                                onChange={(e) => setParsedSmsData(prev => prev ? { ...prev, categoryId: e.target.value } : null)}
                              >
                                <option value="">-- Choose Category --</option>
                                {(activeLedger.categories || []).map(cat => (
                                  <option key={cat._id} value={cat._id}>{cat.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                            <button 
                              className="btn-add-item" 
                              style={{ width: 'auto', padding: '0.3rem 1rem', fontSize: '0.8rem' }}
                              onClick={() => handleLogParsedSMS(activeLedger.month)}
                            >
                              Confirm & Log Item
                            </button>
                            <button 
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                              onClick={() => {
                                setSmsInput('');
                                setParsedSmsData(null);
                              }}
                            >
                              Discard
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {showTimelineView ? (
                      <div className="timeline-view" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const groups = getTimelineGroups(activeLedger);
                          const dateKeys = Object.keys(groups);

                          if (dateKeys.length === 0) {
                            return (
                              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.95rem' }}>
                                No transactions logged for this month yet.
                              </div>
                            );
                          }

                          return dateKeys.map(dateStr => {
                            const items = groups[dateStr];
                            return (
                              <div key={dateStr} className="timeline-date-group">
                                <div className="timeline-date-header">
                                  <span>{dateStr}</span>
                                </div>
                                <div className="timeline-items">
                                  {items.map(item => {
                                    const isIncome = item.type === 'income';
                                    return (
                                      <div key={item._id} className="timeline-item-row">
                                        <div className="timeline-item-info">
                                          <div className="timeline-item-name">
                                            {item.name}
                                          </div>
                                          <div className="timeline-item-meta">
                                            <span style={{ 
                                              background: isIncome ? 'rgba(46, 117, 89, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                              color: isIncome ? 'var(--credit-green)' : 'var(--text-secondary)',
                                              padding: '0.1rem 0.4rem',
                                              borderRadius: '4px',
                                              marginRight: '0.4rem',
                                              fontSize: '0.65rem',
                                              fontWeight: 600
                                            }}>
                                              {item.categoryName}
                                            </span>
                                            {item.payee && `to ${item.payee}`}
                                            {item.mode && ` • via ${item.mode}`}
                                            {item.note && ` • Note: ${item.note}`}
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                          <span className={`timeline-item-amount ${isIncome ? 'income' : 'expense'}`}>
                                            {isIncome ? '+' : '-'}{currency} {item.amount.toLocaleString('en-IN')}
                                          </span>
                                          <button 
                                            className="item-delete-btn"
                                            onClick={() => {
                                              if (isIncome) {
                                                handleDeleteIncome(activeLedger.month, item._id);
                                              } else {
                                                handleDeleteItem(activeLedger.month, item.categoryId, item._id);
                                              }
                                            }}
                                            style={{ padding: '0.2rem' }}
                                            title="Delete transaction"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <>
                        <div className="categories-list">
                          {(!activeLedger.categories || activeLedger.categories.length === 0) ? (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                              No spending categories created for this month yet. Use the bar below to add one!
                            </div>
                          ) : (
                            activeLedger.categories.map(cat => {
                              const isCatOpen = openCategories.has(cat._id);
                              const catTotal = cat.items.reduce((sum, item) => sum + item.amount, 0);
                              const percentage = activeTotal > 0 ? (catTotal / activeTotal) * 100 : 0;
                              const inputs = itemInputs[cat._id] || { name: '', payee: '', amount: '', note: '', mode: 'UPI', isRecurring: false, date: '' };
                              const todayStr = new Date().toISOString().substring(0, 10);
                              const selectedDate = inputs.date !== undefined && inputs.date !== '' ? inputs.date : todayStr;
                              
                              // Budget limits calculations
                              const limit = cat.budgetLimit || 0;
                              const hasLimit = limit > 0;
                              const limitPercentage = hasLimit ? Math.min((catTotal / limit) * 100, 100) : 0;
                              const isOverBudget = limit > 0 && catTotal >= limit * 0.9;

                              return (
                                <div key={cat._id} className={`category-accordion ${isCatOpen ? 'open' : ''}`}>
                                  
                                  {/* Trigger row */}
                                  <div className="category-trigger" onClick={() => toggleCategory(cat._id)}>
                                    <div className="category-title-section">
                                      <span className="accordion-arrow" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {isCatOpen ? '▼' : '▶'}
                                      </span>
                                      
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span className="category-name">{cat.name}</span>
                                          {isCatOpen && (
                                            <button 
                                              className="edit-budget-btn"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingBudgetCategory(cat._id);
                                                setBudgetLimitInput(limit > 0 ? limit.toString() : '');
                                              }}
                                            >
                                              <Edit3 size={11} />
                                            </button>
                                          )}
                                        </div>
                                        
                                        {/* Budget Limit Sub-bar */}
                                        {editingBudgetCategory === cat._id ? (
                                          <div className="budget-edit-form" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                              type="number"
                                              className="form-input form-input-amt"
                                              placeholder="Budget Limit"
                                              value={budgetLimitInput}
                                              onChange={(e) => setBudgetLimitInput(e.target.value)}
                                              style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', height: 'auto', width: '90px' }}
                                            />
                                            <button 
                                              className="btn-add-item" 
                                              style={{ padding: '0.15rem 0.5rem', width: 'auto', fontSize: '0.7rem' }}
                                              onClick={() => handleUpdateCategoryBudget(activeLedger.month, cat._id)}
                                            >
                                              Set
                                            </button>
                                            <button 
                                              className="btn-add-item" 
                                              style={{ padding: '0.15rem 0.5rem', width: 'auto', fontSize: '0.7rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none' }}
                                              onClick={() => setEditingBudgetCategory(null)}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          hasLimit && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', width: '120px' }}>
                                              <div className="budget-bar-bg" style={{ margin: 0, height: '4px', background: 'rgba(255, 255, 255, 0.08)' }}>
                                                <div 
                                                  className={`budget-bar-fill ${isOverBudget ? 'glow-red' : 'glow-gold'}`} 
                                                  style={{ width: `${limitPercentage}%` }}
                                                />
                                              </div>
                                              <span style={{ fontSize: '0.7rem', color: isOverBudget ? 'var(--debit-red)' : 'var(--text-secondary)', fontWeight: 500 }}>
                                                {limitPercentage.toFixed(0)}%
                                              </span>
                                            </div>
                                          )
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div className="category-amount-section">
                                      <div style={{ marginRight: '0.5rem', textAlign: 'right' }}>
                                        <div className="category-sum">
                                          {currency} {catTotal.toLocaleString('en-IN')}
                                          {hasLimit && (
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.3rem' }}>
                                              / {limit.toLocaleString('en-IN')}
                                            </span>
                                          )}
                                        </div>
                                        <div className="category-meta">
                                          {cat.items.length} ITEMS • {percentage.toFixed(0)}%
                                        </div>
                                      </div>
                                      <button 
                                        className="category-delete-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm(`Are you sure you want to delete category "${cat.name}"? This deletes all items inside it.`)) {
                                            handleDeleteCategory(activeLedger.month, cat._id);
                                          }
                                        }}
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Expanded items list and form */}
                                  {isCatOpen && (
                                    <div className="category-content" onClick={(e) => e.stopPropagation()}>
                                      {cat.items.length === 0 ? (
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '1rem 0' }}>
                                          Nothing logged here yet.
                                        </div>
                                      ) : (
                                        <table className="items-table">
                                          <tbody>
                                            {cat.items.map(item => (
                                              <tr key={item._id}>
                                                <td className="item-name-cell">
                                                  <div>{item.name}</div>
                                                  {(item.payee || item.mode || item.date) && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                      {item.date && `${new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • `}
                                                      {item.payee && `to ${item.payee}`} {item.mode && ` • ${item.mode}`} {item.isRecurring && ` • [Recurring]`}
                                                    </div>
                                                  )}
                                                </td>
                                                <td className="item-note-cell">{item.note}</td>
                                                <td className="item-amount-cell">{currency} {item.amount.toLocaleString('en-IN')}</td>
                                                <td style={{ width: '35px', textAlign: 'right' }}>
                                                  <button 
                                                    className="item-delete-btn"
                                                    onClick={() => handleDeleteItem(activeLedger.month, cat._id, item._id)}
                                                  >
                                                    <Trash2 size={13} />
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}

                                      {/* Add new item form inside accordion */}
                                      <div className="add-item-form-grid">
                                        {/* Row 1: Item Name & Payee */}
                                        <input 
                                          type="text" 
                                          className="form-input" 
                                          placeholder="Item Name" 
                                          value={inputs.name || ''}
                                          onChange={(e) => setItemInputs(prev => ({
                                            ...prev,
                                            [cat._id]: { ...inputs, name: e.target.value }
                                          }))}
                                        />
                                        <input 
                                          type="text" 
                                          className="form-input" 
                                          placeholder="Payee/Merchant (e.g. Zomato)"
                                          value={inputs.payee || ''}
                                          onChange={(e) => setItemInputs(prev => ({
                                            ...prev,
                                            [cat._id]: { ...inputs, payee: e.target.value }
                                          }))}
                                        />
                                        
                                        {/* Row 2: Amount & Date */}
                                        <input 
                                          type="number" 
                                          className="form-input form-input-amt" 
                                          placeholder="Amount" 
                                          value={inputs.amount || ''}
                                          onChange={(e) => setItemInputs(prev => ({
                                            ...prev,
                                            [cat._id]: { ...inputs, amount: e.target.value }
                                          }))}
                                        />
                                        <input 
                                          type="date" 
                                          className="form-input" 
                                          value={selectedDate}
                                          onChange={(e) => setItemInputs(prev => ({
                                            ...prev,
                                            [cat._id]: { ...inputs, date: e.target.value }
                                          }))}
                                        />

                                        {/* Row 3: Mode selection */}
                                        <select 
                                          className="form-input"
                                          style={{ background: 'var(--bg-input)' }}
                                          value={inputs.mode || 'UPI'}
                                          onChange={(e) => setItemInputs(prev => ({
                                            ...prev,
                                            [cat._id]: { ...inputs, mode: e.target.value }
                                          }))}
                                        >
                                          <option value="HDFC">HDFC</option>
                                          <option value="SBI">SBI</option>
                                          <option value="Kotak">Kotak</option>
                                          <option value="Cash">Cash</option>
                                          <option value="Card">Card</option>
                                          <option value="UPI">UPI</option>
                                        </select>
                                        
                                        {/* Row 4: Optional Note & Add Action */}
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                          <input 
                                            type="text" 
                                            className="form-input" 
                                            placeholder="Note (optional)" 
                                            value={inputs.note || ''}
                                            onChange={(e) => setItemInputs(prev => ({
                                              ...prev,
                                              [cat._id]: { ...inputs, note: e.target.value }
                                            }))}
                                            style={{ flexGrow: 1 }}
                                          />
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                            <input 
                                              type="checkbox"
                                              checked={!!inputs.isRecurring}
                                              onChange={(e) => setItemInputs(prev => ({
                                                ...prev,
                                                [cat._id]: { ...inputs, isRecurring: e.target.checked }
                                              }))}
                                            />
                                            Repeat monthly
                                          </label>
                                        </div>

                                        <button className="btn-add-item" onClick={() => handleAddItem(activeLedger.month, cat._id)}>
                                          Add
                                        </button>
                                      </div>

                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* New Category input bar */}
                        <div className="add-category-bar">
                          <input 
                            type="text" 
                            className="form-input" 
                            placeholder="New category name..."
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                          />
                          <button className="btn-add-category" onClick={() => handleAddCategory(activeLedger.month)}>
                            + Category
                          </button>
                        </div>

                        {/* Monthly Income Logging Panel */}
                        <div className="income-section">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                            <h3 className="income-title" style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>Monthly Income</h3>
                            <span style={{ fontSize: '0.9rem', color: 'var(--credit-green)', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>
                              Total: {currency} {totalIncome.toLocaleString('en-IN')}
                            </span>
                          </div>

                          {activeIncomeList.length === 0 ? (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '1.25rem 0', fontStyle: 'italic', textAlign: 'center' }}>
                              No income sources logged for this month yet. Use the fields below to add one!
                            </div>
                          ) : (
                            <div className="income-list">
                              {activeIncomeList.map(inc => (
                                <div key={inc._id} className="income-row">
                                  <div>
                                    <span style={{ fontWeight: 600 }}>{inc.source}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', textTransform: 'uppercase' }}>
                                      via {inc.mode}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--credit-green)' }}>+ {currency}{inc.amount.toLocaleString('en-IN')}</span>
                                    <button 
                                      className="item-delete-btn"
                                      onClick={() => handleDeleteIncome(activeLedger.month, inc._id)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add income form */}
                          <div className="income-form" style={{ marginTop: '1.25rem', gap: '0.5rem' }}>
                            <input 
                              type="text" 
                              className="form-input" 
                              style={{ flex: 2 }}
                              placeholder="Income Source (e.g. Salary, Freelance)"
                              value={incomeSourceInput}
                              onChange={(e) => setIncomeSourceInput(e.target.value)}
                            />
                            <input 
                              type="number" 
                              className="form-input form-input-amt" 
                              style={{ flex: 1 }}
                              placeholder="Amount"
                              value={incomeAmountInput}
                              onChange={(e) => setIncomeAmountInput(e.target.value)}
                            />
                            <select 
                              className="form-input" 
                              style={{ flex: 1.2, background: 'var(--bg-input)' }}
                              value={incomeModeInput}
                              onChange={(e) => setIncomeModeInput(e.target.value)}
                            >
                              <option value="HDFC">HDFC</option>
                              <option value="SBI">SBI</option>
                              <option value="Kotak">Kotak</option>
                              <option value="Cash">Cash</option>
                              <option value="Card">Card</option>
                              <option value="UPI">UPI</option>
                            </select>
                            <button className="btn-add-item" style={{ flexGrow: 1, padding: '0.45rem 1.25rem' }} onClick={() => handleLogIncome(activeLedger.month)}>
                              + Log
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            )}

          </React.Fragment>
          );
        })}
      </div>

    </div>
  );
}

export default App;
