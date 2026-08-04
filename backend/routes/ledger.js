const express = require('express');
const router = express.Router();
const Ledger = require('../models/Ledger');
const Bank = require('../models/Bank');

// Helper to resolve the correct bank account for a given payment/income mode
async function getBankForMode(mode, year, month) {
  if (mode === 'Cash') return 'Cash';
  if (['HDFC', 'SBI', 'Kotak'].includes(mode)) return mode;
  
  // For UPI or Card, find the bank that received the latest income in the current month
  if (year && month) {
    try {
      const ledger = await Ledger.findOne({ year, month });
      if (ledger && ledger.income && ledger.income.length > 0) {
        for (let i = ledger.income.length - 1; i >= 0; i--) {
          const incMode = ledger.income[i].mode;
          if (['HDFC', 'SBI', 'Kotak'].includes(incMode)) {
            return incMode;
          }
        }
      }
    } catch (err) {
      console.error('Error finding matching income bank:', err);
    }
  }
  
  // Fallback: get the bank with the highest current balance (excluding Cash), default to HDFC
  try {
    const banks = await Bank.find({ bankName: { $in: ['HDFC', 'SBI', 'Kotak'] } });
    if (banks.length > 0) {
      const highestBank = banks.reduce((max, b) => b.currentAmount > max.currentAmount ? b : max, banks[0]);
      return highestBank.bankName;
    }
  } catch (err) {
    console.error('Error finding bank with highest balance:', err);
  }
  
  return 'HDFC';
}

// Months helper
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * @route   GET /api/ledger
 * @desc    Get all monthly ledger nodes for a specific year (optionally initializes them)
 */
router.get('/ledger', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const existingLedgers = await Ledger.find({ year });

    // Map existing ledgers to a lookup object
    const ledgerMap = {};
    existingLedgers.forEach(l => {
      ledgerMap[l.month] = l;
    });

    // Ensure all 12 months are returned (even if empty in database)
    const allMonths = [];
    for (let i = 0; i < MONTH_NAMES.length; i++) {
      const monthName = MONTH_NAMES[i];
      if (ledgerMap[monthName]) {
        allMonths.push(ledgerMap[monthName]);
      } else {
        // Look up previous month for recurring items carry-over
        let prevMonth = '';
        let prevYear = year;
        if (i === 0) {
          prevMonth = 'December';
          prevYear = year - 1;
        } else {
          prevMonth = MONTH_NAMES[i - 1];
          prevYear = year;
        }

        const prevLedger = await Ledger.findOne({ year: prevYear, month: prevMonth });
        let hasRecurring = false;
        let carrierCategories = [];

        if (prevLedger && prevLedger.categories) {
          prevLedger.categories.forEach(cat => {
            const recurringItems = cat.items.filter(item => item.isRecurring === true);
            if (recurringItems.length > 0) {
              hasRecurring = true;
            }
            // Copy category structure and its recurring items
            carrierCategories.push({
              name: cat.name,
              budgetLimit: cat.budgetLimit || 0,
              items: recurringItems.map(item => ({
                name: item.name,
                payee: item.payee || '',
                amount: item.amount,
                note: item.note || '',
                mode: item.mode || 'UPI',
                isRecurring: true,
                date: new Date()
              }))
            });
          });
        }

        if (hasRecurring) {
          // Auto-initialize and save ledger document since it contains recurring logs
          const newLedger = new Ledger({
            year,
            month: monthName,
            categories: carrierCategories,
            income: []
          });
          await newLedger.save();
          allMonths.push(newLedger);
        } else {
          // Return a mock virtual empty structure
          allMonths.push({
            year,
            month: monthName,
            categories: [],
            income: [],
            isVirtual: true
          });
        }
      }
    }

    res.json({ year, ledgers: allMonths });
  } catch (error) {
    console.error('Fetch ledger error:', error);
    res.status(500).json({ error: 'Failed to retrieve ledger data' });
  }
});

/**
 * @route   POST /api/ledger/category
 * @desc    Add a category to a month's ledger
 */
router.post('/ledger/category', async (req, res) => {
  try {
    const { year, month, name } = req.body;

    if (!year || !month || !name) {
      return res.status(400).json({ error: 'Year, month, and category name are required' });
    }

    // Find or create ledger document
    let ledger = await Ledger.findOne({ year, month });
    if (!ledger) {
      ledger = new Ledger({ year, month, categories: [] });
    }

    // Check if category name already exists in this month
    const exists = ledger.categories.some(cat => cat.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    // Add category
    ledger.categories.push({ name, items: [] });
    await ledger.save();

    res.status(201).json({ message: 'Category added successfully', ledger });
  } catch (error) {
    console.error('Add category error:', error);
    res.status(500).json({ error: 'Failed to add category' });
  }
});

/**
 * @route   DELETE /api/ledger/category
 * @desc    Delete a category and all its items
 */
router.delete('/ledger/category', async (req, res) => {
  try {
    const { year, month, categoryId } = req.body;

    if (!year || !month || !categoryId) {
      return res.status(400).json({ error: 'Year, month, and categoryId are required' });
    }

    const ledger = await Ledger.findOne({ year, month });
    if (!ledger) {
      return res.status(404).json({ error: 'Ledger not found' });
    }

    // Remove category
    ledger.categories = ledger.categories.filter(cat => cat._id.toString() !== categoryId);
    await ledger.save();

    res.json({ message: 'Category deleted successfully', ledger });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

/**
 * @route   POST /api/ledger/item
 * @desc    Add an item to a category
 */
router.post('/ledger/item', async (req, res) => {
  try {
    const { year, month, categoryId, name, payee, amount, note, mode, isRecurring, date } = req.body;

    if (!year || !month || !categoryId || !name || amount === undefined) {
      return res.status(400).json({ error: 'Missing required item details' });
    }

    const ledger = await Ledger.findOne({ year, month });
    if (!ledger) {
      return res.status(404).json({ error: 'Ledger not found' });
    }

    const category = ledger.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const targetMode = mode || 'UPI';
    // Add item with payee, mode, and isRecurring
    category.items.push({
      name,
      payee: payee || '',
      amount: parseFloat(amount),
      note: note || '',
      mode: targetMode,
      isRecurring: !!isRecurring,
      date: date ? new Date(date) : new Date()
    });

    await ledger.save();

    // Deduct from bank using dynamic mode mapping
    const bankName = await getBankForMode(targetMode, parseInt(year), month);
    const bank = await Bank.findOne({ bankName });
    if (bank) {
      bank.history.push({
        amount: bank.currentAmount,
        updatedAt: bank.lastUpdated
      });
      bank.currentAmount -= parseFloat(amount);
      bank.lastUpdated = new Date();
      await bank.save();
    }

    res.status(201).json({ message: 'Item logged successfully', ledger });
  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

/**
 * @route   DELETE /api/ledger/item
 * @desc    Delete an item from a category
 */
router.delete('/ledger/item', async (req, res) => {
  try {
    const { year, month, categoryId, itemId } = req.body;

    if (!year || !month || !categoryId || !itemId) {
      return res.status(400).json({ error: 'Missing required IDs' });
    }

    const ledger = await Ledger.findOne({ year, month });
    if (!ledger) {
      return res.status(404).json({ error: 'Ledger not found' });
    }

    const category = ledger.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const item = category.items.id(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const itemMode = item.mode;
    const itemAmount = item.amount;

    // Pull item
    category.items = category.items.filter(it => it._id.toString() !== itemId);
    await ledger.save();

    // Refund bank using dynamic mode mapping
    const bankName = await getBankForMode(itemMode, parseInt(year), month);
    const bank = await Bank.findOne({ bankName });
    if (bank) {
      bank.history.push({
        amount: bank.currentAmount,
        updatedAt: bank.lastUpdated
      });
      bank.currentAmount += itemAmount;
      bank.lastUpdated = new Date();
      await bank.save();
    }

    res.json({ message: 'Item deleted successfully', ledger });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

/**
 * @route   GET /api/bank
 * @desc    Get current balances of HDFC, SBI, and Kotak accounts (seeds if database empty)
 */
router.get('/bank', async (req, res) => {
  try {
    let banks = await Bank.find({});
    
    // Seed default accounts if empty
    if (banks.length === 0) {
      const defaultBanks = [
        { bankName: 'HDFC', currentAmount: 0, history: [] },
        { bankName: 'SBI', currentAmount: 0, history: [] },
        { bankName: 'Kotak', currentAmount: 0, history: [] },
        { bankName: 'Cash', currentAmount: 0, history: [] }
      ];
      banks = await Bank.insertMany(defaultBanks);
    } else {
      // Seed Cash dynamically if missing in existing database
      const hasCash = banks.some(b => b.bankName === 'Cash');
      if (!hasCash) {
        const cashRecord = new Bank({ bankName: 'Cash', currentAmount: 0, history: [] });
        await cashRecord.save();
        banks = await Bank.find({}); // Refetch
      }
    }
    
    res.json(banks);
  } catch (error) {
    console.error('Fetch bank balance error:', error);
    res.status(500).json({ error: 'Failed to retrieve bank balances' });
  }
});

/**
 * @route   POST /api/bank/update
 * @desc    Update current amount of bank, archiving previous balance to history log
 */
router.post('/bank/update', async (req, res) => {
  try {
    const { bankName, amount } = req.body;

    if (!bankName || amount === undefined) {
      return res.status(400).json({ error: 'Bank name and amount are required' });
    }

    const bank = await Bank.findOne({ bankName });
    if (!bank) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    // Archive current balance to history
    bank.history.push({
      amount: bank.currentAmount,
      updatedAt: bank.lastUpdated
    });

    // Set new balance
    bank.currentAmount = parseFloat(amount);
    bank.lastUpdated = new Date();

    await bank.save();
    res.json({ message: 'Bank balance updated successfully', bank });
  } catch (error) {
    console.error('Update bank balance error:', error);
    res.status(500).json({ error: 'Failed to update bank balance' });
  }
});

/**
 * @route   POST /api/ledger/category/budget
 * @desc    Set/update budget limit for a category
 */
router.post('/ledger/category/budget', async (req, res) => {
  try {
    const { year, month, categoryId, budgetLimit } = req.body;

    if (!year || !month || !categoryId || budgetLimit === undefined) {
      return res.status(400).json({ error: 'Year, month, categoryId, and budgetLimit are required' });
    }

    const ledger = await Ledger.findOne({ year, month });
    if (!ledger) {
      return res.status(404).json({ error: 'Ledger not found' });
    }

    const category = ledger.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    category.budgetLimit = parseFloat(budgetLimit) || 0;
    await ledger.save();

    res.json({ message: 'Budget limit updated successfully', ledger });
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({ error: 'Failed to update budget limit' });
  }
});

/**
 * @route   POST /api/ledger/income
 * @desc    Add an income item to a month's ledger
 */
router.post('/ledger/income', async (req, res) => {
  try {
    const { year, month, source, amount, mode, date } = req.body;

    if (!year || !month || !source || amount === undefined) {
      return res.status(400).json({ error: 'Year, month, source, and amount are required' });
    }

    let ledger = await Ledger.findOne({ year, month });
    if (!ledger) {
      ledger = new Ledger({ year, month, categories: [], income: [] });
    }

    const targetMode = mode || 'Cash';

    ledger.income.push({
      source,
      amount: parseFloat(amount),
      mode: targetMode,
      date: date ? new Date(date) : new Date()
    });

    await ledger.save();

    // Credit bank using dynamic mode mapping
    const bankName = await getBankForMode(targetMode, parseInt(year), month);
    const bank = await Bank.findOne({ bankName });
    if (bank) {
      bank.history.push({
        amount: bank.currentAmount,
        updatedAt: bank.lastUpdated
      });
      bank.currentAmount += parseFloat(amount);
      bank.lastUpdated = new Date();
      await bank.save();
    }

    res.status(201).json({ message: 'Income logged successfully', ledger });
  } catch (error) {
    console.error('Add income error:', error);
    res.status(500).json({ error: 'Failed to add income' });
  }
});

/**
 * @route   DELETE /api/ledger/income
 * @desc    Delete an income item from a month's ledger
 */
router.delete('/ledger/income', async (req, res) => {
  try {
    const { year, month, incomeId } = req.body;

    if (!year || !month || !incomeId) {
      return res.status(400).json({ error: 'Year, month, and incomeId are required' });
    }

    const ledger = await Ledger.findOne({ year, month });
    if (!ledger) {
      return res.status(404).json({ error: 'Ledger not found' });
    }

    const incomeItem = ledger.income.id(incomeId);
    if (!incomeItem) {
      return res.status(404).json({ error: 'Income entry not found' });
    }

    const itemMode = incomeItem.mode || 'Cash';
    const itemAmount = incomeItem.amount;

    ledger.income = ledger.income.filter(inc => inc._id.toString() !== incomeId);
    await ledger.save();

    // Deduct bank using dynamic mode mapping
    const bankName = await getBankForMode(itemMode, parseInt(year), month);
    const bank = await Bank.findOne({ bankName });
    if (bank) {
      bank.history.push({
        amount: bank.currentAmount,
        updatedAt: bank.lastUpdated
      });
      bank.currentAmount -= itemAmount;
      bank.lastUpdated = new Date();
      await bank.save();
    }

    res.json({ message: 'Income deleted successfully', ledger });
  } catch (error) {
    console.error('Delete income error:', error);
    res.status(500).json({ error: 'Failed to delete income' });
  }
});

module.exports = router;
