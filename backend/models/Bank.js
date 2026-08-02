const mongoose = require('mongoose');

const BankHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now }
});

const BankSchema = new mongoose.Schema({
  bankName: { 
    type: String, 
    required: true, 
    unique: true,
    enum: ['HDFC', 'SBI', 'Kotak', 'Cash']
  },
  currentAmount: { type: Number, required: true, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  history: [BankHistorySchema]
}, { timestamps: true });

module.exports = mongoose.model('Bank', BankSchema);
