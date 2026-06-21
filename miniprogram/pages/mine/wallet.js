const api = require('../../utils/api');

Page({
  data: { balance: 0, frozen: 0, available: 0, transactions: [] },

  onLoad() {
    Promise.all([api.getWalletBalance(), api.getTransactions()]).then(([w, tx]) => {
      this.setData({ balance: w.balance, frozen: w.frozen, available: w.available, transactions: tx.list });
    });
  },
});
