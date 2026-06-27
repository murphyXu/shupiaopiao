// User-facing point rules. Keep in sync with cloudfunctions/api/lib/driftPolicy.js and handlers.

const RULES = {
  publishAuditReward: 2,
  publishAuditCap: 2,
  firstGiveBonus: 10,
  inviteReward: 2,
  inviteLifetimeCap: 10,
  inviteLifetimeTimes: 5,
  creditCompleteBonus: 2,
  creditReceiverCancel: -2,
  creditGiverCancel: -5,
  creditGiverTimeout: -10,
  creditDisputeFirst: -5,
  creditDisputeRepeat: -20,
  creditPublishMin: 60,
  publishDailyLimit: 100,
  inflightClaimLimit: 2,
  disputeCompensation: 5,
  shelfCapacityPerCoin: 10,
};

function publishEarnGuideModal() {
  const r = RULES;
  const sections = [
    {
      title: '提交上漂',
      items: [
        `审核通过 +${r.publishAuditReward} 公益积分`,
        `累计最多 ${r.publishAuditCap} 次`,
      ],
    },
    {
      title: '完成赠书',
      items: [
        '接漂方确认收货后，获得本书流转积分',
        `首次完成额外 +${r.firstGiveBonus} 公益积分（仅一次）`,
        '若上漂时将流转积分设为 0，完成赠书不计该首次奖励',
      ],
    },
    {
      title: '取消说明',
      items: [
        '发货前取消上漂，已发放奖励会退回',
      ],
    },
    {
      title: '上漂频率',
      items: [
        `24 小时内最多上漂 ${r.publishDailyLimit} 本`,
        '仅统计审核通过或进行中的上漂，未通过或已取消的不计入',
      ],
    },
  ];
  return {
    title: '上漂赠书可获得积分',
    sections,
    content: sections.map((section) => [
      `【${section.title}】`,
      ...section.items,
    ].join('\n')).join('\n\n'),
  };
}

function inviteRewardSummary() {
  const r = RULES;
  return `共建奖励 +${r.inviteReward} 公益积分/人，累计最多 ${r.inviteLifetimeTimes} 次`;
}

function settingsPointRules() {
  const r = RULES;
  return {
    intro: '公益积分用于站内图书漂流流转，不具备现金属性，不可提现、转让或交易。信用积分用于记录漂流履约情况，初始为 100 分。',
    sections: [
      {
        title: '公益积分 · 加分',
        body: [
          `上漂审核通过：+${r.publishAuditReward}（每位用户累计最多 ${r.publishAuditCap}）`,
          `首次完成赠书并完成接漂：额外 +${r.firstGiveBonus}（每位用户仅一次；0 积分完成不计）`,
          '接漂方确认收货后：赠书方获得该书的流转积分',
          `邀请书友完成有效互动：+${r.inviteReward}（累计最多 ${r.inviteLifetimeTimes} 次，共 ${r.inviteLifetimeCap} 分，不设单日上限）`,
        ].join('\n'),
      },
      {
        title: '公益积分 · 占用与退回',
        body: [
          '申请接漂时会先占用相应公益积分，完成收货后再记录扣除',
          '取消接漂会释放已占用积分',
          '发货前取消上漂，已发放的上漂奖励会退回',
          '经核实赠书方责任且需补偿时，接漂方可获得补偿公益积分',
          `1 公益积分可兑换 ${r.shelfCapacityPerCoin} 本书架收藏额度`,
        ].join('\n'),
      },
      {
        title: '信用积分 · 加分',
        body: [
          `按时完成赠书：+${r.creditCompleteBonus}`,
          `完成接漂并确认收货：+${r.creditCompleteBonus}`,
        ].join('\n'),
      },
      {
        title: '信用积分 · 扣分',
        body: [
          `发货前取消接漂：${r.creditReceiverCancel}`,
          `发货前取消赠书：${r.creditGiverCancel}`,
          `接单后 72 小时未寄出：${r.creditGiverTimeout}`,
          `申诉核实为赠书方责任（首次）：${r.creditDisputeFirst}`,
          `申诉核实为赠书方责任（再次）：${r.creditDisputeRepeat}，并可能扣减公益积分`,
        ].join('\n'),
      },
      {
        title: '使用限制',
        body: [
          `信用积分低于 ${r.creditPublishMin} 分时，暂不可上漂`,
          `24 小时内最多上漂 ${r.publishDailyLimit} 本（仅统计审核通过或进行中的上漂，未通过或已取消的不计入）`,
          '信用积分过低或多次违约，可能限制后续接漂',
          `已接漂未收货最多 ${r.inflightClaimLimit} 单，需先完成在途漂流再申请新书`,
        ].join('\n'),
      },
    ],
  };
}

module.exports = {
  RULES,
  publishEarnGuideModal,
  inviteRewardSummary,
  settingsPointRules,
};
