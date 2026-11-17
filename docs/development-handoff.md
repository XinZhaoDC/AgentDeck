# AgentDeck 开发交接入口

## v0.12.14 当前发布交接

用户确认当前版本满意，并授权提交远程和带说明的tag。当前发布为 `v0.12.14`，分支 `master`，目标 `XinZhaoDC/AgentDeck`；[综合发布说明](development-log.md)覆盖自v0.10.0后的双页/网络/供应商/历史/标签/来源功能及前提，旧tag不移动。此后恢复开发以本节及同ID任务控制区为准，不执行下面旧阶段的安装/未提交next。

本次仅更新发布文档，不变更已确认的0.12.14运行代码；文档更新后重打同版本VSIX，包hash与此前开发交付不同，发布后hash、提交与远程tag核验在 environment/logs/HO-20261109-001/release-0.12.14-20261117-001/RESULT.md。VSIX/out不纳入Git；源码、测试和文档纳入提交。用户满意不替代Windows/WSL、真实出口及全场景认证验收，既有API来源/hooks/完整目录备份等前提继续保留。任务保持in_progress。

## 0.12.14 当前开发阶段

按用户截图修正历史标签设置：管理按钮在简短说明上方；Codex索引按钮独立全宽，与管理按钮对齐，注释不再包裹按钮或嵌套旧索引提示。索引状态改为独立短警告，来源配置/trust说明折叠保留。共享CSS仅增加该操作区布局，双页标签入口统一、Claude索引整区隐藏，回调/禁用/后端保持。结果environment/logs/HO-20261109-001/history-index-layout-20261117-001/RESULT.md。交付0.12.14，0.12.13原包归档；未安装或操作真实数据/权限。下一步宿主验收按钮对齐、说明归属、折叠说明及双页切换。以下旧安装next不执行。

## 0.12.13 当前开发阶段

仅移动共享sessionView中的Codex索引按钮与旧索引状态到历史标签设置，新增专属说明区；按activeTool统一隐藏该区，Claude不显示。事件ID、后端刷新、禁用条件和确认逻辑不变，0.12.12新API来源保持。交付0.12.13，0.12.12原包本轮rollback保留；结果environment/logs/HO-20261109-001/history-index-placement-20261117-001/RESULT.md。未安装或改真实数据/账号/网络/权限。下一步宿主检查两页入口及说明，旧安装next不执行。

## 0.12.12 当前开发阶段

用户要求未来API聊天自动按具体API名划分，旧未知不追溯；两页同步，保留原profiles。historySources.ts在应用API时生成原生SessionStart配置与私有绑定；适配器在同一FileRecovery事务写入，root/profile/env由app确认当前attached API档案后传入。historySourceHook.ts只处理新建startup/clear/fork，不读凭据/聊天正文，不改trust；通过原生session_id原子发布共享history-sources收据，同ID不覆盖。原生Codex信任流程须用户完成，生产代码无bypass。

HistoryLabels.model按候选会话ID读取收据，自动来源为创建时名称，同名跨环境合组，原API共享profile不拆。手动归类包括显式未知优先；继续旧会话不改来源。结构树和选择/管理读取同一来源，不改变显示副本状态。私有绑定/收据加入git/VSIX排除；完整目录备份才包含收据。

当前结果environment/logs/HO-20261109-001/api-history-sources-20261117-001/RESULT.md，版本0.12.12、0.12.11回退包保留；未安装、未改真实数据/权限/认证/网络/绑定。原生隔离探针确认Codex需要用户trust、SessionStart在首次turn触发，Claude --init-only可触发；Codex测试仅对合成会话使用局部trust override，绝不写进产品。下步宿主应用API并重载、首次审核Codex来源hook，按host-acceptance验收新旧分组及实际双页。旧current/安装next仅作历史。

## 0.12.11 当前开发阶段

两客户端使用同一 historyLabelPage.ts：新增五分区导航与焦点面包屑，三级蓝/青绿/紫色框线与浅底色、编号、卡片、原名与输入说明；项目显示所属环境，树分级徽标与缩进。保存/分类/原profile和数据协议保持；仅页面维护展开状态，搜索临时展开后可恢复。环境未标注解释改为缺少关联的旧历史，不虚构第三个环境；management.md说明Codex索引刷新职责及不补归属。

交付0.12.11，0.12.10原包保留本轮rollback。当前结果environment/logs/HO-20261109-001/history-label-layout-20261117-001/RESULT.md；针对标签行为与双页入口做合成检查、编译/类型检查及包审计。未安装、未改真实历史/权限/绑定/认证/网络；没有可用浏览器进行主题截图验收。下一步按host-acceptance.md在宿主两页检查主题、窄屏和键盘位置。旧阶段入口仅作历史背景，不执行旧安装next。

## 0.12.10 当前开发阶段

最新用户授权：标签集中到数据与存储管理页，官方帐号/API来源一级、环境二级、项目三级，上方编辑，下方历史chat树草稿预览与批量归类。保留原名/路径和profiles；同环境同路径跨帐号/模式自动共用，不同环境/路径可明确复用项目标签。API来源选择手动归类，不用当前API配置推断旧/新聊天真实来源。

historyLabels.ts只写history-labels.json，包含三类标签、项目复用映射、API来源名与逐会话manual归类；historyLabelPage.ts集中编辑/搜索/复选/预览，保存有revision冲突检查。原生历史区旧按钮移除，保留内部labelHistoryProject打开统一页。选择/管理页面标签与原名并列，源key和已添加灰显/移除语义保持；新标签不强改原生会话标题。

标签文件共享组0660/目录2770，UID1000跨属主共享保存已隔离验证；不改真实权限/认证/网络/历史。环境标签跨所有来源共用，项目标签按环境+完整路径去重、可显式跨环境复用；Codex与Claude分别管理。旧catalog观察到的环境不是创建来源证明，未知历史可手动指定。备份整个数据目录才能包含标签sidecar。

结果environment/logs/HO-20261109-001/history-labels-20261117-001/RESULT.md。交付0.12.10，0.12.9原包保留回退；未安装、未读写真实聊天或账号配置。下一步用户按host-acceptance.md验收两页共用标签、API/环境批量归类、结构树与原有增量历史功能。以下旧安装next不执行。

## 0.12.9 实现背景

用户反馈宿主Codex索引升级失败：session_index.jsonl是普通文件，FileRecovery.link拒绝覆盖。linkNames现在先合并名称，再通过事务moveFile原样保留普通文件，最后建立共享链接；运行入口/环境缓存两处均处理，原生刷新失败恢复原文件inode/内容/权限及共享名称。无须手动删除原索引，不触碰认证或聊天。

两页将“项目环境归属”改为“设置历史项目的环境标签…”，操作回执/选择标题/输入提示一起调整，明确只分组/排序、不移动聊天或切帐号。内部action ID保持不变。

本轮结果environment/logs/HO-20261109-001/codex-name-index-20261117-001/RESULT.md。旧构建先复现同一错误，再定向回归和原生检查；0.12.8保留回退。未安装或修改真实宿主文件/权限/账号/代理。下一步用户安装0.12.9、结束原生任务后升级/刷新索引并重载；真实宿主GUI仍需验收。以下0.12.8功能继续保留，旧安装next不执行。

## 0.12.8 实现背景

用户授权双页跨官方/API档案的多选历史：帐号/API→环境→项目→会话，只增量添加，已添加灰显；“管理已显示历史”单独多选移除。独立副本保护源记录，续聊使用当前目标帐号/API，新聊天原路径不变。保留profiles/ID及认证/网络隔离；本轮无真实数据或权限变更、安装、账号/代理操作。

historyImports.ts管理普通文件副本/新会话ID、来源与隐藏保留内容；historyPicker.ts元数据树支持整组/单条复选、搜索和灰显，服务端过滤不允许的key。原生可见范围Codex为目标profile全局、Claude为目标profile当前项目，同范围跨环境去重。枚举读取所有来源档案，坏文件单项报告，不需要来源写权限。Claude消息UUID关联链独立映射，包含subagents JSONL；Codex元数据改为当前provider及目标cwd。

移除前保留续聊：Claude事务移动到profile/history-imports/；Codex先提交保留内容，再原生thread/delete删除独立副本与索引。原生归档文件同样可定位移除；RPC/状态失败保留材料、可重试。重新添加恢复原续聊副本。历史管理记录在profile/history-imports.json，位置均相对根；当前history-only备份不包含隐藏副本库，备份整个数据目录可保留。

新选择不再创建硬链接；0.12.6/0.12.7旧映射仅显式解除/恢复，先重载再多选。写入端维护自己拥有的历史0660/2770，跨UID读取端不改其他属主文件；真实旧0600文件仍须写入环境/所有者修复。

结果与源码/构建/原生/包审计见environment/logs/HO-20261109-001/history-multi-selection-20261117-001/RESULT.md。0.12.7原包保留回退，不重建profiles、不为显示历史重新登录。下一步用户安装0.12.8按host-acceptance.md验收真实宿主GUI与续聊；合成原生读取不证明实际模型任务、跨平台或外部附件路径有效。以下旧next不执行。

## 0.12.4 实现背景（交付以0.12.6为准）

用户报告Claude停用代理后重载出现“已停用＋代理应用状态异常”。隔离用例复现：停用已恢复原字段并删除路由，但持久managedTools仍包含Claude，重启据此对已清空的代理备份执行校验，产生误报。

修复共享网络管理器：持久标记仅包含仍有路由的工具；读取旧数据时忽略无路由的孤立标记，不写迁移、不重新应用代理。启动仍执行恢复核查，真实pending损坏、外部改动继续报警。适用于两客户端，真实账号/设置/凭据未访问或更改。

本地包code/AgentDeck/agentdeck-0.12.4.vsix；0.12.3原包归档本阶段rollback。编译/类型检查、5套件98项定向检查及包审计通过；复现失败轮保留，证据environment/logs/HO-20261109-001/claude-proxy-disable-20261113-001/RESULT.md。无安装/提交/真实联网或新增常驻进程端口，前轮dirty保留。

下一步用户安装0.12.4并重载；已停用的Claude应显示“未应用代理”，无红色误报，草稿地址可保留。不需要为消除旧标记重新应用代理；旧真实GUI/登录/实际路由验收边界仍有效。以下各旧版本的安装next为历史，以本段为准。

此文档用于换 Codex 官方账号、换会话或换环境后恢复开发。代码和文档不会随账号切换而丢失，但新会话不会自动拥有上一账号的对话上下文。

## 0.12.3 实现背景（交付以0.12.4为准）

用户持续要求两页同步。成功添加API后名称/API Key清空，基本字段地址/模型/群组保留；完整配置重置为无密钥默认模板。失败保留输入。创建回执带客户端与保存名称，只清空相应当前/缓存草稿，避免切页恢复已提交密钥。

名称框使用原生datalist，以当前客户端历史成功名称和现有API名称提供候选。providerNameHistoryByTool写入webview state，最多100个成功名称/客户端，归一化去重；不保存密钥或配置文本，名称唯一性规则不变。页面状态恢复可继续联想。相关源码为shared/ui/providerPage.ts、shared/clients/providerController.ts和ui/sidebarView.ts。

本地交付code/AgentDeck/agentdeck-0.12.3.vsix；上一版0.12.2归档本阶段rollback，源码根只留新版。6套件最近有效134项检查、编译与包审计通过；证据environment/logs/HO-20261109-001/provider-name-memory-20261113-001/RESULT.md。此前所有dirty保留，未安装/提交或写真实供应商/账号/网络/历史，无新增常驻进程端口。本轮没有实际凭据读取或联网请求。

下一步用户安装0.12.3重载，按host-acceptance.md验收两页名称原生下拉、添加成功/失败及密钥清空；旧GUI/实际路由/登录验收边界继续保留，不恢复旧安装/清理next。

## 0.12.2 实现背景（交付以0.12.3为准）

后续 UI 仍默认同步 Codex／Claude。群组折叠改为图标，保留 title／aria。请求增加 standard／compatible 预设，标准参数不裁剪上下文或强加输出／思考上限；旧 justdowork／custom 显式配置保留，新建无规则供应商为 direct＋standard。更改预设不自动应用客户端。

余额规则集中 src/models/usagePresets.ts，后端和群组／模板／供应商共用；新增 Sub2API、New API Key／账户、Credit Grants 与服务商选项，区分管理认证、动态币种、除数及无限 Key。所有手动预设可展开调整接口、字段和换算，保持各自认证。预设说明见 api-presets.md。OpenRouter 账户 credits 以当前官方文档的管理密钥要求为准。

本地参考 cc-switch 86c749b98e76f2ccf7877e718aa3060725aea651 与 Magpie e4ea31321556bc34e366ba8eac27b1c4f450d2e4，只读未改。15 套件最终 358 项检查通过，详细输入／指纹／失败日志和新包审计见 environment/logs/HO-20261109-001/request-balance-presets-20261113-001/RESULT.md。whu-usi /v1/usage 已用新版 Sub2API 和 auto 实测 HTTP200；API Key 只在内存用于该服务，未保存或输出凭据／原始响应，当前模式仍 official。

本地包 code/AgentDeck/agentdeck-0.12.2.vsix；0.12.1 原包归档本阶段 rollback，源码根只留最新版。未自动安装、提交推送、修改真实账号／供应商／代理／历史；实际查询仅余额 GET，不调用生成。新文档随包交付。

下一步用户安装 0.12.2 并重载，按 host-acceptance.md 验收两页与 whu-usi 查询；当前实际供应商规则未代保存。其他服务商／原生 GUI／登录与真实出口仍待验收，不执行旧版安装或目录清理 next。以下是前轮实现背景。

## 0.12.1 实现背景（交付以 0.12.2 为准）

本 chat 后续未特别说明的 UI 调整同时作用于 Codex 和 Claude Code；各自配置、网络、数据、草稿和折叠状态继续独立。此项是用户的持续偏好，换账号／会话后也应沿用。

已应用代理旁显示实际应用配置的备注（空白则“临时设置”）、代理入口及绕过地址，是否保存预设不影响备注显示；编辑草稿不改变摘要，停用／旧配置／核查异常不标为有效摘要。每个供应商群组有明确展开收起按钮，保留标题操作栏，官方只读／禁用群组也能折叠；打开群组设置会展开所属群组。

群组和 API 名称分别在各客户端内唯一；API 跨群组也不能重名。统一首尾空格、大小写和全角兼容字符，两个客户端之间允许同名；新增、群组重命名、导入均有定向验证。已有校验继续复用，新增供应商现在先检查名称再读密钥；不自动重命名已有数据。

包：code/AgentDeck/agentdeck-0.12.1.vsix；上一版 0.12.0 归档到本阶段 rollback。8 套件最近有效结果共 232 项检查及编译通过，证据 environment/logs/HO-20261109-001/shared-ui-polish-20261113-001/RESULT.md。未安装、未改真实账号／网络／历史，未提交推送，无新增常驻进程端口。当前工具不支持当前聊天标题修改，已告知用户手动改为“AgentDeck开发”。

下一步安装最新 0.12.2 重载，核对两页代理摘要、群组折叠、重名提示和窄侧栏／主题显示；0.12.0 的真实登录与实际出口验收仍未关闭，不能用本轮合成 UI 检查替代。以下保留原生账号和路由实现背景，不恢复旧安装或数据清理步骤。

## 0.12.0 实现背景（交付状态以 0.12.1 为准）

用户已明确开始 Claude 对齐，并授权实施。Claude 不再暂缓：页面采用与 Codex 一致的总览、数据与存储、网络、账号与 API，以及群组/模板/余额/默认地址、拖动/箭头/开关、局部反馈和内嵌编辑。共享页面组件在 shared/ui/providerPage.ts；两个页面各自保存内存草稿与环境选择，公共 DOM 中旧 codex 前缀只是控件锚点，不决定操作归属。

Claude 的账号和 API 使用原生配置目录，projects 历史按档案共享；客户端设置、认证、绑定、日志与网络按环境独立。首次接入保留默认目录“未设置 CLAUDE_CONFIG_DIR”的语义，避免改变原生全局状态/系统凭据库命名空间。官方/API 往返不退出账号、不复制或回填 OAuth；新环境或失效认证仍需原生登录。外部 API 覆盖、外来环境 marker、目录/设置恢复冲突会明确阻止写入。已有进程需要重载/重启；外部 CLI 使用界面显示的目录选择方式，浏览器授权网络独立。

网络仍仅在主界面管理。Claude 代理写入当前环境已准备目录及扩展代理镜像，新目录切换前接入同一路由；停用恢复每个受管目录原值。首次默认档案若被后来继承的 CLAUDE_CONFIG_DIR 覆盖，要求更正启动环境，避免冒充已复用登录。Claude Console 无 API Key OAuth 的原生目录外存储例外不在隔离承诺内。

0.12.0 原包现保留在 shared-ui-polish-20261113-001/rollback；0.11.3 原包仍保留在 claude-alignment 阶段 rollback，源码根只留新版。Git 基线仍为 8dd4bf7，所有前轮未提交修改保留。没有自动安装、提交、修改真实账号/绑定/网络/历史或旧共享 http.proxy。

本轮证据为 environment/logs/HO-20261109-001/claude-alignment-20261113-001/RESULT.md；各轮源码/构建指纹、失败轮、回退快照和原生二进制指纹保留。23 个定向/公共套件的最近有效结果及原生两客户端路由夹具以该 RESULT 为准；合成验证不证明真实 OAuth、GUI、系统凭据库、Windows/WSL 或跨OS历史。Codex 缓存刷新/退出/官方与API往返回归通过，不以 Claude 新测试替代 Codex 测试。

下一步用户安装最新 0.12.1 重载，按 host-acceptance.md 逐项验收。当前容器此前已应用的 0.11.2 Codex 路由和用户截图中的共享 http.proxy 原值/归属仍按旧核验边界保留，不宣称清理完成。不要重复执行旧目录删除、重接或旧发布 next。

## 前版基线与入口

- 插件显示名：AgentDeck；仓库及本地源码名称：AgentDeck。内部身份仍为 `xinzhaodc.vscodemodelswitch`，配置键、命令 ID 和数据键有意保留，不能批量更名。
- 历史发布基线：0.10.0；原发布 tag 为 `v0.10.0`，创建/推送结果以 Git 和任务 RESULT 为准。发布检查只新增测试、文档和仓库元数据，不改该版运行逻辑。
- 容器源码：`/home/workspace/Forest_Interface/code/AgentDeck`。环境入口仍是 `enter-vscodemodelswitch`，Node22 前缀不更名。
- 唯一总任务：`HO-20261109-001` / `vscodemodelswitch-fusion`，owner 为 Forest_Interface。
- 总任务正文：`/home/workspace/Forest_Interface/AI_prompt/tasks/task_HO-20261109-001_vscodemodelswitch-fusion.md`，只默认读取到 `ACTIVE_TASK_READ_END`。
- 权威结果：`/home/workspace/Forest_Interface/.ai/results/HO-20261109-001-result.md`。当前发布证据：`environment/logs/HO-20261109-001/release-0.12.14-20261117-001/`；各功能阶段证据按前部版本记录定向读取。
- GitHub 仓库已由用户更名为 `XinZhaoDC/AgentDeck`，地址为 https://github.com/XinZhaoDC/AgentDeck；本地 origin 使用新 SSH 地址。`v0.10.0` 保持原提交，后续仓库元数据修订不移动 tag。最新提交与推送状态以 Git 和任务结果为准。

先完整读取适用 AGENTS.md、owner 数据库导航和活动任务，再读 [客户端架构](client-architecture.md)、[存储管理](management.md)、[独立网络](network-proxy.md)、[开发日志](development-log.md)、[验证记录](validation.md)。不要重新执行历史控制区的旧 next。

## 已实现与责任划分

`src/clients/index.ts` 注册客户端，`src/shell/clientRegistry.ts` 提供导航/消息/页面契约。Codex 和 Claude 各有 controller/view/adapter；Codex 历史与诊断已归位到其客户端目录。`src/shared/` 放真正公用的供应商、请求字段和确认组件，`src/ui/sidebarView.ts` 是壳和共享表单，`src/app.ts` 仍负责生命周期与共享服务，不是完全拆散的独立插件。未来客户端可以注册自有页面和消息；WorkBuddy 仅有测试夹具，没有真实适配器。

Codex 页面：总览 → 数据与存储 → 网络设置 → 账号与 API。统一折叠模块、中文说明、模块局部结果、十秒反馈、必须重载/短暂建议两类状态已实现。API 有空群组、两级排序、移动、环境独立禁用、当前供应商保护、可复用群组设置模板与 v2 导入导出。默认“独立供应商”可排序，名称在各客户端范围内唯一。

共享：供应商定义、Key 引用、群组/模板及对应档案历史。环境独立：当前供应商、启用/禁用、网络、活动档案绑定、配置与认证缓存。Provider 日常存储仍是 VS Code globalState/SecretStorage；数据目录的 providers 是主动导出位置，不是自动同步源。

官方档案各自共享历史；每个客户端的 API 供应商分别共用该客户端唯一 API 档案。Codex 的 `CODEX_HOME` 是其客户端入口，sessions/archived_sessions 链接到共享历史，sqlite_home 指向对应共享索引。固定挂载根不能重命名时只更换历史子目录链接；认证/配置在入口与本环境私有缓存之间明确切换。不要删除用户的 ai_client_data/codex。

## 当前实现与验收边界

Claude 现有 controller 处理自身模式/账号/群组消息，不能调用 Codex 登录切换；同名群组、模板、供应商、表单草稿和配置导入互不混用。API 源新增不显示请求处理控件，按本客户端所选群组后台初始化；协议字段仍按客户端原生格式区分。Claude 官方模型/额度请通过原生 /status、/usage 确认，不调用 Codex 的 RPC 或读取 OAuth 后拼装第三方请求。

原生 Linux 路由验证使用安装二进制、隔离 HOME、合成 Key 和本地503，只证明请求交给选定代理，不证明真实登录/聊天。真实 UI 拖动、原生历史列表、系统凭据库和实际出口仍需实机验收。后续修改共享表单/网络/群组必须定向回归两个客户端，不只测当前页面。

## 换成另一个官方账号前

先结束当前任务并完成交接。由用户在 AgentDeck 创建/选择**另一个官方账号档案**，确认切换、重载后在官方 Codex 登录新账号；不要让新账号继续使用旧账号档案的认证或历史。旧账号档案和环境缓存保留。新账号通常需要自行登录，这与复用同一个账号在同一环境中的缓存不同。

开发上下文通过这份交接文档和同一任务文件恢复，与登录缓存或旧会话是否在 Chats 中可见无关。

## 可直接发给新账号 AI 的提示词

```text
继续 AgentDeck 开发，总任务 HO-20261109-001（vscodemodelswitch-fusion），owner Forest_Interface。
请先读取 /home/workspace/AGENTS.md、Forest_Interface 的适用规则与数据库导航，
再读唯一任务的当前控制区（读到 ACTIVE_TASK_READ_END），
以及 /home/workspace/Forest_Interface/code/AgentDeck/docs/development-handoff.md。
按交接导航阅读架构、存储、网络、开发日志和最新验证结果，并核对 Git/安装版本。
不要扫描其他算法根，不恢复旧历史 next，不删除现有历史数据，不读取或输出认证/Key正文。
本会话执行来源按实际记录；沿用同一个任务和文档，不另建账号专属任务副本。
当前0.12.5包含此前功能、Codex跨环境索引修复及Claude跨项目历史入口。请核对本阶段 RESULT、已完成和未验收项目，
再按我的最新反馈推进。保持各客户端配置、网络和数据独立。
此条只恢复上下文，暂不实施，不改登录、共享目录、VPN 或运行配置。
```
