# 显卡观测站
<!-- impeccable:product-schema 1 -->
## Platform
web
## Stack
静态 HTML/CSS/JavaScript + Node.js 采集任务 + GitHub Actions/Pages；沿用用户现有 GitHub、Cloudflare 域名托管方式。实现选择由本次“开始实现”委托；未进行框架偏好访谈。
## Users
朋友已经确定买 RTX 5080 或 RTX 5070 Ti，品牌和具体型号可商量。
## Product Purpose
判断今天价格是否值得关注，发现近 30 天新低，在网站内提示。
## Operating Context
只看京东自营，收货地区北京；每天北京时间 09:00 采集，定时服务可能延迟。网站公开部署到 gpu.shenlii.cn。
## Capabilities and Constraints
11 品牌：华硕、微星、技嘉、七彩虹、影驰、索泰、耕升、映众、铭瑄、盈通、万丽。展示有条件的最低到手价，明确 PLUS、券、国补等条件。同一商品、同条件比较；库存未知不参与可买最低价。先看概要，再展开商品表；两张走势图。
## Evidence on Hand
用户没有京东联盟/开放平台 API 权限，已同意先做好网站并引导接入。当前没有核验过的实时价格、自营商品清单或价格历史。不得填充假价格，不能承诺京东接口权限或个人账号优惠可获取。
## Product Principles
真实先于齐全。缺失与失败可见。价格比较保持相同口径。不补造历史。网页浏览不调用 AI。
