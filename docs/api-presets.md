# API 请求处理与余额查询预设

Codex 和 Claude Code 共用以下界面和预设定义，供应商、群组及配置仍按客户端分别管理。群组和“群组设置模板”保存可复用规则，API Key、管理令牌和管理用户 ID 在单个供应商中配置。已有供应商不会因升级自动覆盖规则；重选预设会载入新版默认值，保存后仍需按原流程应用实际请求处理配置。

## 请求处理

先选择直接调用或本地协议兼容转发。本地兼容转发可选：

| 预设 | 默认行为 |
| --- | --- |
| 标准协议转发 | 保留完整历史、工具结果、工具说明和客户端输出上限；不改工具名，不代执行联网工具，不强加思考预算；最多一次上游尝试。 |
| 流式与工具 JSON 兼容 | 使用标准参数，额外修复工具 JSON；尚未输出响应时最多两次上游尝试。 |
| justdowork 专用兼容 | 保留原有工具映射、文本工具协议、联网工具与历史/输出限制，适用于确实需要这些处理的上游。 |
| 自定义上游 | 保留旧版自定义默认值，可在高级设置逐项修改。 |

未配置群组规则的新供应商使用“直接调用＋标准预设”，不会自动启动本地转发。Codex 按上游实际协议选择 Responses 或 Anthropic Messages；Claude 使用 Anthropic Messages。上述预设不新增 Chat Completions 转换能力，使用前须确认供应商提供所选协议。网络代理继续只在主界面设置；请求预设不改变代理节点、账号目录或官方登录。

## 余额预设

在供应商“额度查询”中启用查询，选择预设并点击测试。群组/模板中只能保存规则，测试与管理凭据在供应商内操作。自动识别先匹配已知服务商，再优先尝试常见中转 Key 接口；提供管理令牌时会优先尝试相应账户接口。失败不会冒充零余额。

| 预设 | 凭据 | 查询与数值 |
| --- | --- | --- |
| Sub2API · 当前 Key 可用额度 | 模型 API Key | `/v1/usage` 的 `remaining`，金额已换算；可同时显示 `quota.used`、`quota.limit`。whu-usi 已只读实测通过。 |
| New API / One API · Key 额度 | 模型 API Key | `/api/usage/token`，`data.total_available` 等字段，默认除以 500000。 |
| New API · 账户余额 | 管理令牌＋用户 ID | `/api/user/self`，`data.quota` / `data.used_quota`，默认除以 500000。 |
| Sub2API · 账户钱包 | 管理令牌 | `/api/v1/user/profile` 的 `data.balance`。 |
| OpenAI 兼容中转 · Credit Grants | 模型 API Key | `/dashboard/billing/credit_grants` 的余额/已用/总量；用于兼容中转。 |
| DeepSeek · 账户余额 | 模型 API Key | `/user/balance`，优先显示有余额的钱包及其实际币种。 |
| SiliconFlow · 账户余额 | 模型 API Key | `/v1/user/info`，优先读取含赠送额的 `totalBalance`；部分站点可能已停用接口。 |
| Moonshot / Kimi · 账户余额 | 模型 API Key | `/v1/users/me/balance`；国内站 CNY、国际站 USD。 |
| StepFun · 账户余额 | 模型 API Key | `/v1/accounts`；国内站 CNY、国际站 USD。 |
| Novita · 账户余额 | 模型 API Key | `/openapi/v1/billing/balance/detail` 的 `availableBalance` 除以 10000，单位 USD。 |
| OpenRouter · 账户余额 | 管理密钥（Management Key） | `/api/v1/credits`，`total_credits - total_usage`；在单个供应商的管理令牌字段填写。 |
| OpenRouter · Key 额度 | 模型 API Key | `/api/v1/key`，显示 Key 消费上限的剩余值。 |
| 通用余额 | 模型 API Key | `/user/balance` 的 `balance`；优先使用响应的 `unit`。 |
| 自定义 | 模型 API Key | 自填 URL、JSON 字段路径、显示单位及数值除数。 |

所有手动预设都可展开“接口、字段与换算参数”，调整路径、字段和除数，继续保留该预设的认证方式。选择自定义会使用模型 API Key；需要管理认证时应在相应账户预设内调整参数。单位只影响显示，不执行汇率换算。New API 的 500000 是默认比例，站点比例不同时应按其说明修改。

地址占位符：`{{baseUrl}}` 为原供应商地址，`{{rootUrl}}` 去除末尾 `/v1`，`{{apiBaseUrl}}` 确保末尾有 `/v1`。预设保留部署子路径，避免重复 `/v1`。旧版 New API / DeepSeek 的 `{{baseUrl}}` 模板继续按原语义处理。

New API / OpenRouter 不限额 Key 或 Sub2API 的不限额标志会显示“Key 未设额度上限”，不会据此宣称账户钱包无限或余额为零。Key 可用额度与整个账户钱包可能不同；接口返回哪一种由所选预设决定。余额测试使用 GET，不发生成请求；查询仍遵守当前客户端的 AgentDeck 网络路由。

## 参考与验证范围

参考本地开源实现：cc-switch `86c749b98e76f2ccf7877e718aa3060725aea651` 的 `UsageScriptModal.tsx`、`services/balance.rs` 及协议适配职责；Magpie `e4ea31321556bc34e366ba8eac27b1c4f450d2e4` 的 `provider/balance.go`、`balance_probe.go` 与流式错误处理。AgentDeck 使用自己的预设定义与查询器；参考文件指纹和具体路径保存在任务结果。

协议核对：[New API 令牌用量](https://doc.newapi.pro/api/token-usage/)、[DeepSeek 余额与币种](https://api-docs.deepseek.com/api/get-user-balance/)、[OpenRouter 账户余额与管理密钥](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits)。OpenRouter 账户余额认证以当前官方文档为准，管理密钥与模型 Key 分别保存。

whu-usi 的 Sub2API 预设和自动识别均在 2026-11-13 只读验证成功；实时数值随使用变化。其他服务商的预设通过本地协议夹具验证，未持其真实凭据逐一验证。实机界面、主题与原生扩展验收仍见 [验收步骤](host-acceptance.md)。
