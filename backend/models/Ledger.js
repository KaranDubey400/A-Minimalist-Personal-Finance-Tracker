const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  payee: { type: String, default: '' },
  amount: { type: Number, required: true },
  note: { type: String, default: '' },
  mode: { type: String, enum: ['UPI', 'Cash', 'Card'], default: 'UPI' },
  isRecurring: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  budgetLimit: { type: Number, default: 0 },
  items: [ItemSchema]
});

const IncomeSchema = new mongoose.Schema({
  source: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});

const LedgerSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  month: { type: String, required: true }, // e.g. "August"
  categories: [CategorySchema],
  income: [IncomeSchema]
}, { timestamps: true });

// Compound index to ensure only one ledger document exists per year/month combination
LedgerSchema.index({ year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Ledger', LedgerSchema);
