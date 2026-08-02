const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

const mongoose = require('mongoose');
const Ledger = require('./models/Ledger');
const Bank = require('./models/Bank');
require('dotenv').config();

const test = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/phonepe-tracker-test';
  console.log(`Connecting to database: ${MONGODB_URI}...`);
  
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully.');

  // Clear any existing test data
  console.log('Cleaning test collections...');
  await Ledger.deleteMany({});
  await Bank.deleteMany({});

  // 1. Create a ledger node for August 2026
  console.log('Test 1: Creating a ledger document for August 2026...');
  const ledger = new Ledger({
    year: 2026,
    month: 'August',
    categories: [
      { name: 'Cigarette', items: [] },
      { name: 'Snapmint', items: [] }
    ]
  });
  await ledger.save();
  console.log('Success: Ledger document created.');

  // 2. Add spending item to Category
  console.log('Test 2: Logging an item inside category "Cigarette"...');
  const activeLedger = await Ledger.findOne({ year: 2026, month: 'August' });
  const category = activeLedger.categories.find(c => c.name === 'Cigarette');
  category.items.push({
    name: 'Marlboro Light',
    amount: 40.00,
    note: 'Pan shop',
    date: new Date()
  });
  await activeLedger.save();
  console.log('Success: Item cost added to category.');

  // 3. Initialize HDFC bank balance
  console.log('Test 3: Seeding HDFC bank with initial amount...');
  const bank = new Bank({
    bankName: 'HDFC',
    currentAmount: 48000.00,
    lastUpdated: new Date(Date.now() - 5 * 60000) // 5 minutes ago
  });
  await bank.save();
  console.log('Success: Bank entry saved.');

  // 4. Update HDFC balance and archive previous to history
  console.log('Test 4: Updating bank balance with HDFC spending update...');
  const activeBank = await Bank.findOne({ bankName: 'HDFC' });
  
  // Archive old balance
  activeBank.history.push({
    amount: activeBank.currentAmount,
    updatedAt: activeBank.lastUpdated
  });

  // Set new amount
  activeBank.currentAmount = 47960.22;
  activeBank.lastUpdated = new Date();
  await activeBank.save();
  console.log('Success: Balance updated and archived to history.');

  // 5. Verify fields
  console.log('Test 5: Verifying historical database updates...');
  const finalBankObj = await Bank.findOne({ bankName: 'HDFC' });
  const finalLedgerObj = await Ledger.findOne({ year: 2026, month: 'August' });

  const totalSpentInMonth = finalLedgerObj.categories[0].items[0].amount;
  const differenceVal = finalBankObj.currentAmount - finalBankObj.history[0].amount;

  console.log(`\nVerification Results:`);
  console.log(`- Month Spending Total: ₹${totalSpentInMonth} (Expected: ₹40)`);
  console.log(`- Bank current balance: ₹${finalBankObj.currentAmount} (Expected: ₹47960.22)`);
  console.log(`- Bank difference: ₹${differenceVal} (Expected: ₹-39.78)`);
  console.log(`- History items saved: ${finalBankObj.history.length} (Expected: 1)`);

  if (totalSpentInMonth === 40 && finalBankObj.currentAmount === 47960.22 && Math.abs(differenceVal - (-39.78)) < 0.01) {
    console.log('\n🌟 ALL TESTS PASSED SUCCESSFULLY! Ledger and banking engine is correct.');
  } else {
    throw new Error('Verification assertion mismatch. Check math logic.');
  }

  await mongoose.connection.close();
  console.log('Database connection closed.');
};

test().catch(async (error) => {
  console.error('\n❌ TEST FAILED WITH ERROR:', error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});
