Component({
  properties: {
    guide: {
      type: Object,
      value: {},
    },
  },

  methods: {
    noop() {},

    onClose() {
      this.triggerEvent('close');
    },

    onConfirm() {
      this.triggerEvent('confirm');
    },
  },
});
