const { trackOaEvent } = require('../../utils/officialAccountPrompt');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: '',
    },
    desc: {
      type: String,
      value: '',
    },
    scene: {
      type: String,
      value: '',
    },
    showDismiss: {
      type: Boolean,
      value: true,
    },
  },

  methods: {
    onFollow() {
      trackOaEvent('oa_follow_click', this.data.scene);
      this.triggerEvent('follow');
    },

    onDismiss() {
      trackOaEvent('oa_milestone_dismiss', this.data.scene);
      this.triggerEvent('dismiss');
    },
  },
});
