const {
  isOfficialAccountConfigured,
  openOfficialAccountProfile,
} = require('../../utils/officialAccountPrompt');

Component({
  properties: {},

  data: {
    showNative: false,
  },

  lifetimes: {
    attached() {
      this.setData({ showNative: isOfficialAccountConfigured() });
    },
  },

  methods: {
    onNativeLoad(e) {
      const status = e.detail && e.detail.status;
      if (status === 0) {
        this.setData({ showNative: true });
        return;
      }
      this.setData({ showNative: false });
    },

    onNativeError() {
      this.setData({ showNative: false });
    },

    onFallbackTap() {
      openOfficialAccountProfile();
      this.triggerEvent('follow');
    },
  },
});
