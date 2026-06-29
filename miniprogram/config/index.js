/**
 * 书漂漂 · 云开发版配置
 * cloudEnvId 在微信开发者工具 → 云开发 → 设置 中查看
 */
module.exports = {
  cloudEnvId: '', // 留空则使用默认环境 cloud.DYNAMIC_CURRENT_ENV
  // 订阅消息模板（公众平台 → 我的模板）
  /** 公众号原始 ID（gh_ 开头），同主体关联后填写；留空则不展示关注引导 */
  officialAccountUsername: 'gh_194654afd42f',
  subscribeTmplIds: {
    /** 待办事项提醒：发货截止前催办 */
    shipRemind: 'w1maSH93gEzVNejUv04-kqiat9ezvkYznjkUreW003I',
    /** 服务进度通知：图书被接漂后通知赠书方 */
    claimNotify: 'Gw6HlIXjcKwN2uhfvnQMpjInSj-a9dCAabcwxGWUBlg',
  },
};
