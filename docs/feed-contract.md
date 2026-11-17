# 授权价格 JSON 数据源约定

这是一份本网站定义的适配器输出格式，**不是京东官方 API 的原始格式**。具体京东接口需拿到权限后按当时官方文档实现、验证。

HTTPS GET 响应 UTF-8 JSON；可选 Authorization: Bearer 配置在服务器上。最大 8 MB。字段只能包含可公开的商品信息。

```json
{
  "schemaVersion": 1,
  "region": "北京",
  "observedAt": "当天带时区的 ISO 时间",
  "products": [
    {
      "id": "真实京东 SKU 数字编号",
      "brand": "华硕",
      "gpu": "RTX 5070 Ti",
      "name": "商品页完整型号",
      "url": "https://item.jd.com/真实编号.html",
      "selfOperated": true,
      "ownershipVerifiedAt": "核实自营身份的 ISO 时间"
    }
  ],
  "observations": [
    {
      "productId": "同一个真实编号",
      "date": "当天北京日期 YYYY-MM-DD",
      "observedAt": "当天带时区的 ISO 时间",
      "priceFen": 0,
      "conditions": ["必须列明实际优惠要求；普通公开价可填普通用户"],
      "stock": "in_stock",
      "region": "北京",
      "verified": true,
      "source": "authorized_feed",
      "sourceUrl": "https://item.jd.com/真实编号.html"
    }
  ]
}
```

上面只有结构说明，故意没有可当成实价的数值；`priceFen: 0` 会被校验拒绝，必须换成真实正整数分。`conditionKey` 由采集程序从条件列表生成，不必提供。

品牌必须是候选11个之一；gpu 仅接受 RTX 5080 或 RTX 5070 Ti；产品链接必须为干净、无参数的 item.jd.com 数字 SKU 地址。库存枚举 `in_stock` / `out_of_stock` / `unknown`。不得把未核实库存标有货。

相同券门槛、PLUS 资格、补贴、支付与地区要求使用稳定而清楚的条件文案；任一条件变化必须变更列表。优惠未核实时，保留可核实的普通价或不输出报价，不能简单把网页划线价减券拼出无法结算的低价。

每次 feed 仅放此次真实采集的商品与报价。旧历史由程序合并；不允许回填旧日价格、未来报价或覆盖更晚采集记录。同日重复采集保留较晚的有效记录，不将重复采集当多天。
