# AgentDeck 验证记录

## v0.12.14 发布核对

本轮为已确认版本的文档收口及Git发布，运行代码保持history-index-layout-20261117-001最终指纹，双页50项UI结果继续有效；不重复已通过的无关原生/网络/模型检查。重新编译/类型检查、文档包字节及私有文件排除、Git待提交文件清单、annotated tag与远程分支/peeled commit核对的完整结果见 environment/logs/HO-20261109-001/release-0.12.14-20261117-001/RESULT.md。各小版本验证属于各自输入/构建，不累计为本次全量验收；用户满意与实际测试范围分别记录。

## 0.12.14 / 历史设置布局

复用双页UI套件，核对按钮在说明上方、索引按钮为全宽纵向容器首项、无注释嵌套按钮、旧索引短提示显示/隐藏、来源说明折叠且保留/hooks指引、动作与待重载禁用及Claude隐藏。编译/检查及包指纹审计见environment/logs/HO-20261109-001/history-index-layout-20261117-001/RESULT.md；DOM验证不代表真实主题/鼠标布局已验收。

## 0.12.13 / 索引入口位置

复用双页UI套件，确认索引按钮和旧索引状态同处历史标签设置、Codex说明可见、Claude整区隐藏、刷新动作与待重载禁用保留。编译/类型检查、包内out/docs及测试指纹审计；不重复原生/网络测试，不改后端。结果environment/logs/HO-20261109-001/history-index-placement-20261117-001/RESULT.md。真实主题/鼠标布局待宿主验收。

## 0.12.12 / 新 API 来源记录

新增test-history-sources.js覆盖双适配器绑定事务/失败恢复、用户hooks保留、旧未知、新建分组、切API、续聊/压缩、跨环境同名合组、手动未知/标签优先、归档稳定ID、官方/错档案拒绝、并发完整收据、实际hook命令、UID1000在root共享组目录写入与坏收据隔离。标签UI检查自动来源与显式未知覆盖；既有双页/档案/索引/导入/网络隔离定向回归。

新增test-native-history-sources.js使用已安装Codex原生app-server：普通未审核hook不执行；仅在受控合成会话配置局部bypass_hook_trust验证实际SessionStart调用与完整收据。先thread/start无收据，首次turn触发；endpoint固定127.0.0.1:1、代理也仅回环，没有真实上游或付费请求，子进程结束。Claude原生--init-only触发记录，无登录/生成。探针日志、正式轮次、指纹与参数见environment/logs/HO-20261109-001/api-history-sources-20261117-001/RESULT.md。未配置native路径的SKIP不计通过；产品不得绕过原生信任。

真实VSCode GUI信任入口、实际模型请求供应商、外部覆盖/旧进程、Windows/macOS仍未验收。自动记录不是逐请求来源审计，必须通过AgentDeck应用并重启，hooks可用且共享记录可写；不能从合成通过推导所有外部启动方式已覆盖。

## 0.12.11 / 历史标签页视觉层级

test-history-label-ui.js新增检查：分区/原名/标签字段、导航滚动与焦点位置、树各级路径、勾选和改标签保留展开、搜索临时展开与恢复、未标注历史不虚增环境。继续验证预览、项目复用、批量归类、仅保存元数据、失败草稿与转义，连同标签后端、两客户端UI及控制器入口定向回归。有效日志与指纹见environment/logs/HO-20261109-001/history-label-layout-20261117-001/RESULT.md及effective-checks.json。无浏览器/真实VSCode主题渲染检查，合成DOM不证明像素布局；原生索引/网络代码未改，不重复原生或网络测试。

## 0.12.10 / 三级共用历史标签

新增history-labels与history-label-ui覆盖三级标签与原名、环境/项目跨帐号共用、跨路径复用、API来源未记录/手动归类、环境批量归属、清空、失败恢复、并发版本拒绝、跨挂载/UID1000共享保存、客户端隔离及真实Webview脚本草稿预览/归类/保存。控制器与双页UI回归统一入口位置、标签装饰及不改变已添加状态；原生索引/副本读取及隐藏继续隔离验证。完整指纹、轮次和包审计见同任务history-labels-20261117-001/RESULT.md。无真实数据/认证/网络写入或安装。

## 0.12.9 / 普通名称文件阻塞修复

先用旧构建复现普通session_index.jsonl被拒；test-history-index新增运行入口/缓存两文件合并、较新名称保留、原文件inode/0600保留、重复升级以及原生刷新失败后内容/inode/权限/共享名称恢复。两页UI检查新环境标签文字，原生索引/跨挂载及多选历史继续回归。输入、指纹和最终结果见同任务codex-name-index-20261117-001/RESULT.md；未操作真实宿主数据或认证。

## 0.12.8 / 跨档案增量多选

新增test-history-imports/test-history-picker，覆盖全部来源、上下文排序、普通文件独立副本、UID1000读取外属主只读历史且不chmod、不可读单项隔离、已加灰显/新增去重/父级多选/服务端拒绝非法key、多项移除保留续聊/重加、Codex原生删除失败及发布失败后的保留重试。test-history-controller更新双页多选/管理/原生命令/帐号竞态和旧入口清理；Claude UI检查更新新语义。

test-native-history-imports以隔离合成档案验证Codex默认provider下多源副本list/read、原生归档后移除、两种列表索引清理、再添加/多删；Claude实际SDK验证多源副本list/info/消息帧、子集隐藏和默认本地历史保留。无真实认证或模型turn。旧原生索引/跨挂载与写入端权限回归继续保留，SKIP不计通过。最终有效轮次、指纹、包审计及未验收边界见同任务history-multi-selection-20261117-001/RESULT.md。

## 0.12.7 / 环境项目浏览与跨UID新文件

新增history-browse与history-controller检查覆盖环境/项目/账号/工作区隔离、原生命令/URI、索引升级引导、硬链接失败回滚、原生替换保留、备份去重、新聊天原目录及跨UID显式0600/0700。实际Claude SDK读取列表/会话/消息/帧并验证新聊天目录不变；实际Codex二进制验证所选会话可读、缺失ID拒绝。历史存在而模拟扫描零结果必须失败。最终有效轮次和源码/构建指纹见同任务history-unified-selection-20261116-001/effective-checks.json；未配置原生路径的SKIP不算通过。真实GUI/跨平台/登录出口仍不由这些检查替代。

## 0.12.6 / 原生项目范围

定向检查覆盖Claude项目枚举、关联环境、相对链接跨挂载、映射归属、已有真实目录冲突、外改阻断、映射失败回滚、解除保留原文件及跨挂载恢复路径约束；控制器覆盖显式确认、账号ID/设置不变、重载锁定和两客户端原生命令路由。双页UI覆盖入口、能力差异、映射状态和重载状态；原0.12.5的自建历史列表测试随功能撤回。

scripts/test-native-claude-history.js在合成子进程中加载已安装Claude2.1.323的真实SDK读取代码，仅在内存导出读取器，不激活官方扩展、联网或创建原生子进程。官方/API分别验证默认当前项目、映射后list/info/解析两条消息、原挂载失效后的相对链接读取、解除后恢复默认并保留原消息。scripts/test-native-history.js与test-native-history-paths.js继续用Codex26.1007.21434原生二进制验证私有索引及跨挂载读取。未配置原生路径的SKIP不算通过。

最终检查、原生二进制/读取器指纹和VSIX审计见environment/logs/HO-20261109-001/history-native-scope-20261113-001/RESULT.md及effective-checks.json。没有实际用户历史/认证/网络写入，GUI鼠标/原生历史列表显示、真实继续任务、Windows/WSL/macOS不由这些检查替代。以下旧版验证仅作历史证据，0.12.5的AgentDeck聊天列表已撤回。

## 0.12.5 / 原生索引与全部项目历史

最终final-3共12套件178项通过：索引7、Claude历史8、存储12、管理9、Codex UI31、Claude/双页UI19、Claude档案23、工作流18、隔离网络14、环境26、文件恢复7、API接入4。验证旧共享索引无自动迁移、显式升级保留认证inode/旧索引、失败回滚、外部SQLite覆盖、原生分页/归档扫描与无账号/生成RPC、Claude跨项目列表/只读/原生命令、官方/API及账号隔离、UI搜索/客户端路由和待重载禁用。

native-final-2使用已安装Codex26.1007.21434原生二进制与合成HOME/配置/历史，2套件7项通过：GUI同样的useStateDbOnly列表/读取、旧挂载与环境路径不可用、私有索引不同、自定义名称共享且原生重命名不脱离链接、API默认provider筛选及官方隔离。此前旧共享索引A1/B0的失败现象保留；不是实际用户聊天/登录或GUI验证。

首次编译缺少新action label；final-1环境夹具没有模拟原生索引RPC；Claude新增测试先误把refresh当重载、点击后忙碌状态未结束。修正并保留日志/输入后最终通过，不把这些中间结果当交付。探索性私有索引曾遗漏原生名称记录，名称可移植性探针暴露后补齐共享名称记录，再做最终原生回归。

编译、类型检查、包内out/文档及测试指纹一致性审计通过。完整证据environment/logs/HO-20261109-001/native-history-paths-20261113-001/RESULT.md。Claude跨项目原生打开按本地官方扩展代码核对并执行模拟命令检查；真正VSCode GUI/原生继续任务仍待用户验收。

## 0.12.4 / 代理停用与重启

5套件98项通过：隔离网络14、Claude档案/网络/认证生命周期23、网络传输13、Codex UI30、Claude/双页UI18。新增覆盖：停用重启无误报/无managed标记、两客户端旧孤立标记无写迁移、真实pending损坏仍报警；加强已应用Claude字段外改的refresh报警及恢复验证。先在旧构建复现新用例失败（9项先行通过），失败不计入最终通过数。

编译/类型检查及VSIX内out/文档逐字节审计通过，最终运行源码/构建与测试指纹一致。证据environment/logs/HO-20261109-001/claude-proxy-disable-20261113-001/RESULT.md。仅合成目录/密钥/存储和本地测试传输，没有实际用户设置读取、代理应用/恢复或原生窗口重载验证。

## 0.12.3 / 添加表单与名称候选

6套件最近有效134项：新增供应商表单9、Claude/双页UI18、Codex UI30、群组UI32、群组控制器27、工作流18。新增用例执行完整webview脚本和两客户端创建控制器，验证仅成功后清空、保留其他基本字段、失败保留、完整配置不保留内联Key、切页不恢复旧Key、持久名称恢复/客户端隔离、回执仅名称无凭据及现有名称候选去重。

final-1的其余5套件通过；新增用例首次因Node/VM数组原型不同而严格相等失败，改为Array.from后final-2的9项通过。产品源码未因此修改，不累加重复检查。证据：environment/logs/HO-20261109-001/provider-name-memory-20261113-001/RESULT.md。没有真实供应商写入或实际凭据使用；原生下拉弹窗的视觉/键盘交互需安装后GUI验收。

## 0.12.2 / 请求与余额预设

15 套件最近有效结果共 358 项具名检查，最终均退出 0；其中请求／余额预设 25 项、Claude／双页 UI 18 项。使用合成密钥、本地 HTTP 及模拟存储验证接口路径、两客户端归属、Key／管理认证区分、New API 除数、Sub2API 货币值、零／无限额度、DeepSeek 钱包币种、SiliconFlow 赠送额、OpenRouter 管理密钥及可编辑参数。标准转发的长上下文／工具输出／客户端上限和兼容预设实际重试次数均有运行验证。

round-1 与 final-1/2/3 保留每轮日志和源码／构建／脚本指纹，最新结果用 final-3，不累加重复轮次。首次类型检查的模板括号错误日志保留，编译前已修正；后续参数可编辑和官方认证核对后重跑相关完整定向批次。

真实 whu-usi 只读查询：Sub2API 预设和自动识别均 HTTP200，当前可用额度成功返回；初次 New API 路径404明确说明协议不同，不等于 Key 失效。认证仅内存用于该服务域名，未输出／持久化 Key、原始响应或账号标识，未切换当前 official 模式、改真实设置或发生成请求。证据为 environment/logs/HO-20261109-001/request-balance-presets-20261113-001/RESULT.md；其他服务商仅夹具验证，不能推断都已实际可用。

## 0.12.1 / 双客户端网络摘要、折叠与唯一名称

8 个相关套件最近有效结果均退出 0，共 232 项具名检查：Claude UI／双页隔离 14、Codex UI 30、群组 UI 32、群组初始化与名称 11、导入导出 10、群组控制器 27、代理 90、工作流 18。验证应用值和草稿区分、无预设备注／临时设置、停用／旧配置／异常清除摘要、两页和只读／禁用群组折叠、跨群组规范化重名与写入前拒绝；两个客户端同名仍允许。

证据 environment/logs/HO-20261109-001/shared-ui-polish-20261113-001/RESULT.md。round-1 保留全部日志；新增按钮使旧“所有按钮只读”断言需限于变更操作，重名测试需先准备两边确实同名的数据，修正后 round-2 重跑相应两套件通过。不是产品缺陷或真实数据失败；不累加两轮重复检查。每轮保留源码／构建／脚本指纹及合成输入位置。编译、类型检查、包内容审计另见本轮 RESULT。

未做真实登录、代理应用或安装；浏览器／GUI、主题和窄侧栏视觉、跨OS仍待实机验收。上一版原生网络与登录检查以其阶段证据为准，本轮不重复计入。

## 0.12.0 / Claude 对齐、网络与登录状态

23 个公共/定向套件的最近有效结果全部退出 0，共 415 项具名检查，另有 Codex 模式/认证断言。Claude 生命周期套件 23 项、Claude UI/隔离 12 项；Codex 固定目录、账号/API 往返、刷新与退出登录回归继续有效。覆盖原默认目录及变量语义、独立账号目录、API 单例、两环境历史共享/认证隔离、切换取消/失败/崩溃恢复/外部冲突、日志归属和迁入复制校验。

原生已安装二进制在隔离 HOME、合成 Key 与本地503代理中通过 2 项路由检查：Codex HTTPS CONNECT 及 Claude 从 settings.json 读取代理并覆盖继承入口。没有真实 OAuth/账号登录、令牌刷新或付费模型请求；不把 CLI 传输验证当作扩展 GUI、浏览器出口、系统凭据库、Windows/WSL 或跨OS验收。

证据 environment/logs/HO-20261109-001/claude-alignment-20261113-001/RESULT.md。final-1 保存完整23套件；后续发现的默认目录继承冲突/确认和说明范围修订按影响重跑 final-2/3，最近有效结果由 effective-checks.json 去重汇总。每轮 code-sha256.json 记录源码/构建/脚本身份；round-1至6失败与修订记录保留，不重复计数。包审计和真实验收缺口见本轮 RESULT。

## 0.11.1 / 状态突出显示与边框

TypeScript 编译、git diff --check 及三个定向套件通过：test-codex-ui 30项、test-codex-workflows 18项、test-group-ui 32项，共80项，包含已有跨客户端表单/网络草稿与第三客户端夹具，只作为共享UI回归，不是Claude功能验收。新增状态检查覆盖网络已应用/草稿/旧配置/异常、API普通按钮和当前标记、切换后的标记更新、当前API待应用修改、官方账号当前与待重载。没有重复运行无变化的原生/付费模型测试。

证据 environment/logs/HO-20261109-001/codex-current-state-20261112-001/RESULT.md。这些检查执行实际webview脚本的DOM夹具，不验证浏览器像素、主题对比度或实际鼠标操作，仍需用户实机验收。

## 0.11.0 / 群组设置与层级编辑

TypeScript 编译通过；test-codex-release.py 的 final-002：22 套件全部退出 0，276 项具名检查通过，另有模式/认证断言。16 项其他客户端/第三客户端检查明确排除，不计为通过。新增 scripts/test-group-settings.js 验证新建后台初始化及原表单约束、独立群组默认、模板余额规则和凭据排除、旧模板读取、v2 往返、载入设置保持凭据与模型；扩展群组 UI/删除/草稿及网络预设结构检查。

证据位于 Forest_Interface/environment/logs/HO-20261109-001/codex-group-settings-20261112-001/，保留最初失败的夹具日志和最终 suite manifest。UI 检查执行实际 webview 脚本的 DOM 夹具，不测浏览器像素、主题对比度或真实鼠标拖动；原生 Codex 使用合成 HOME、密钥和本地网络，不调用付费模型。实际 GUI/跨OS/真实账号/Chats 仍待用户验收，Claude 不属于本轮功能改造或专项验收。

## 0.10.1 / Codex 目录权限与供应商交互

新增 scripts/test-storage-permissions.js，在 Linux root 启动的隔离夹具中以 UID1000/GID1000 实际连接 API 档案、建立私有日志和追加 root 后续新建的合成 rollout；覆盖 restrictive umask、默认 ACL、凭据不继承、共享注册表更新、权限修复与回滚。需要现成 setfacl/getfacl；所有输入均为合成内容，输出由任务证据目录保留。

新增 scripts/test-api-enrollment.js 覆盖 API 模式连接仅含官方档案的共享根：显式创建 API 库、取消无副作用、既有 API 只连接以及并发初始化保护。

群组 UI 检查覆盖 ON/OFF 位置/状态/当前源保护、350ms 长按/短按/取消、箭头边界与单步顺序、禁用分区、草稿式网络/模板载入；请求处理复制的后端检查确保密钥、模型、额度及真实路由不变。专项 Codex runner 原有客户端排除边界继续有效；精确最终数字与失败轮见 codex-usability-20261112-001/RESULT.md。真实鼠标绘制/宿主窗口、登录/模型及 Windows/WSL 不计通过。

## 0.10.0 / 已安装 Codex 专项发布验收

2026-11-12：已安装扩展、原交付 VSIX 与源码构建的128个out文件逐字节相同。20个Codex专属/公共能力套件253项具名检查及模式认证断言全部通过；16个其他客户端/扩展性场景明确排除，不计通过，不运行Claude原生程序。首次新增测试因夹具把未设置值表示为显式undefined而失败，修正夹具后通过；补充诊断断言区分服务可达与HTTP401模型目录失败，运行代码未改。原生Codex验证官方/API双环境历史列表及读取、两个API源默认过滤互见，以及指定HTTPS CONNECT代理。

真实环境只读检查：sessions和archived_sessions均链接到现有共享根，分别57/155个rollout；不读取聊天正文。代理12000匿名访问公共主页HTTP200，但当前官方扩展目录无新版dispatcher，不能据此宣称已启用独立聊天路由。无真实账号切换/迁移/网络写入、无付费模型请求；宿主Windows/WSL/真实鼠标与Chats未验收。命令、范围、源指纹、失败和最终结果见同任务codex-release-audit-20261112-001。宿主操作步骤见[宿主机验收](host-acceptance.md)。

复现命令（参数必须显式给出，原生检查不允许跳过）：

```bash
python3 scripts/test-codex-release.py \
  --node /path/to/node22 \
  --out /path/to/installed-extension/out \
  --native-codex /path/to/official-extension/bin/linux-x86_64/codex \
  --evidence /path/to/new-evidence-directory
```

`--out`也可以使用当前构建目录。证据目录必须不存在；其中保留原夹具指纹、精确排除清单、环境范围替换与逐套件结果。正式判定为final-001的20套件253检查；installed-001/002是保留的前序验证。

## 0.10.0 / 客户端模块与 Codex 群组

新增 test:provider-groups、test:group-ui、test:group-import；覆盖跨客户端归属、第三客户端注册/页面、群组/成员排序和禁用、当前供应商保护、模板复制、v1/v2及失败恢复。test:native-history 增加不同API地址/合成密钥的两环境共享历史默认过滤/读取检查，无模型请求。完整命令、首次失败及最终源码/包身份见 Forest_Interface/environment/logs/HO-20261109-001/client-groups-20261112-001/RESULT.md。

## 0.9.6 / Codex 全功能审查

新增 `test:codex-workflows` 执行实际 webview 脚本及存储/日志消息桥，检查各入口、官方账号与 API 诊断目标、网络备注和未测试状态。`test:isolated-network` 增加启动命令注册丢失/被覆盖检查；`test-native-network` 的原生 Codex 请求改用 HTTPS CONNECT 夹具。复现失败、最终完整回归、当前环境只读检查与匿名公共页面代理测试见 Forest_Interface/environment/logs/HO-20261109-001/codex-ui-audit-20261112-001/RESULT.md。

实际数据目录接入已由用户完成，AI 只核对链接、绑定与安全日志元数据。未自动迁移真实网络、登录、切换账号或调用付费模型；真实窗口视觉、账号/额度/聊天及 Windows/WSL 仍需验收。

## 0.9.5 / 挂载点连接与固定目录缓存

`npm run test:fixed-home` 在合成目录中模拟根重命名 EBUSY，不操作真实挂载。覆盖原子认证更新、登出、账号/API隔离、跨环境和跨库、失败/中断/冲突恢复、独立挂载历史子目录报错及失败首次接入重试。`test:native-history` 从真实目录入口写合成 rollout，用原生 app-server 列出/读取，再移除原环境入口和私有缓存，验证另一环境仍可读取。只设置合成 HOME，无登录或模型请求。

本轮命令/构建身份/结果与包审计：Forest_Interface/environment/logs/HO-20261109-001/mounted-home-20261111-001/RESULT.md。真实 VS Code/账户/挂载迁移由用户验收；Windows/WSL未测试。

## 0.9.4 / 网络状态措辞与按钮位置

编译、现有UI回归与包审计；检查状态徽标紧接操作按钮、旧/新/异常配置显示区分。前轮原生Linux两项代理入口验证日志已回读，无真实聊天测试或自动迁移。精确结果见Forest_Interface/environment/logs/HO-20261109-001/route-status-ui-20261111-001/RESULT.md。

## 0.9.3 / 原生确认语言

编译及197项相关检查通过：运行确认4、UI27、独立网络10、环境26、管理9、代理90、测速31。检查英文VSCode环境下的中文确认/取消、局部错误翻译与诊断分类保持、多环境代理和管理回归；实际命令、最终源码哈希与范围见Forest_Interface/environment/logs/HO-20261109-001/popup-chinese-20261111-001/RESULT.md。使用隔离夹具，不修改真实账户或代理；不视为Windows/WSL原生验收。

## 0.9.2 / AgentDeck 名称

仅显示名称修订：编译、现有 test-codex-ui 27项回归与包身份/编译文件一致性审计。未重复0.9.1全部157检查或原生网络/历史测试。详细结果见 Forest_Interface/environment/logs/HO-20261109-001/agentdeck-rename-20261111-001/RESULT.md。

## 0.9.1 / 中文与显示名称修订

本轮编译与157项相关检查通过：test-proxy 90、test-codex-ui 27、test-speed 31、test-management 9。覆盖中文默认、网络操作顺序、配置路径移除、原始名称/模型ID、反馈计时及原有管理功能。证据为 Forest_Interface/environment/logs/HO-20261109-001/chinese-ui-20261111-001/final-002；未重新进行真实登录、原生VPN聊天、Windows或WSL测试。前轮267项完整回归保留为0.9.0证据，不冒充本轮全量复测。

## 0.9.0 / 前轮完整验证

本轮最终完整检查：267 具名检查 + 模式/认证断言；原生 Linux 路由与 thread/list/read 均使用隔离空目录及合成数据。测试日志、源码哈希和每次失败尝试在 Forest_Interface/environment/logs/HO-20261109-001/codex-redesign-20261111-001。最新结果见其中 RESULT.md。真实账号、图形界面、Windows/WSL 和扩展升级仍不是自动检查证明的范围。

新增脚本：`scripts/test-isolated-network.js`（代理字段、父环境不变、普通 CLI 配置及回滚）、`scripts/test-management.js`（导出/导入隔离、快照管理、编辑器浏览、重载状态、只读账号 RPC）、`scripts/test-native-network.js <codex可执行文件> <claude可执行文件>`（本地代理故意错误响应）。`scripts/test-codex-ui.js` 增加提示计时、待重载/临时提醒、局部更新与数据原样保留验证。原生历史测试需要显式设置 `VSCODEMODELSWITCH_NATIVE_CODEX`；未设置时 SKIP 不能算原生验证通过。

下文保留此前版本验证说明；旧版共享 VS Code HTTP 代理行为以 0.9.0 网络说明替代。


Use the existing Node22 environment, run check/compile, then test-proxy.js, test-codex-proxy.js, test-codex-modes.js, test-speed.js, test-network.js, test-sessions.js, test-environments.js, test-recovery.js test-runtime-guard.js, test-operation-log.js and test-codex-ui.js. Use task-local TMPDIR and VSCODEMODELSWITCH_TEST_HOME. These are synthetic editor/filesystem fixtures and loopback services; no real credentials or model requests.

Storage checks cover two environments sharing an account's old/new rollouts, distinct auth/config and selections, singleton API history, reconnect/new environment, explicit legacy migration, backup/restore and broken links. Recovery checks inject partial apply failure, process exit and external modification; confirmation checks exercise one modal, cancel and accept without process inspection; logs cover default storage, verified relocation, failed persistence, other-window writes, rotation and scoped deletion. The DOM harness executes the complete webview script and verifies local green/red/cancel feedback, no scrolling, per-environment fold state, retained Tool field, official/API read-only modes and separate Claude layout. It does not validate browser painting or VS Code rendering.

Optional `VSCODEMODELSWITCH_NATIVE_CODEX=/path/to/codex node scripts/test-native-history.js` uses isolated HOME and synthetic data. It invokes initialize/thread/list/thread/read only; the former environment is removed before opening the same history in the second. No turn/start or login. This confirms installed native backend compatibility on this Linux filesystem, not real VS Code rendering or cross-OS mounts. See [management](management.md) for manual acceptance and limits.

The older sections below retain API/proxy validation context. Their pre-0.8 permanent Codex backup/reset descriptions are superseded by the current management contract.

# VSCodeModelSwitch Validation Guide

## Speed tests — v0.5.0

Run `npm run test:speed` for loopback SSE, synthetic official Codex, read-only
queries, model/configuration freshness, cancellation and UI/controller checks.
Keep existing proxy/mode regressions. See [measurement definitions and real-test
boundaries](speed-benchmark.md). Real requests consume quota and must be reported
separately from mocks; packaging does not activate an already-installed extension.

This project can be validated locally without publishing to the VSCode Marketplace.

## Codex proxy and mode status — v0.4.0 — 2026-10-22

Run the automated checks with existing dependencies:

```bash
npm run check
npm run test:proxy
npm run test:codex-proxy
npm run test:codex-modes
```

Completed validation: TypeScript check/compile passed, **64 UI/lifecycle/CC
checks** and **22 Codex proxy checks** passed, and sandbox official/API/auth
assertions passed. The tests cover native Responses and Anthropic translation,
tools/images/opaque state, response identity/continuation, JSON/SSE completion,
retry/timeout/cancellation, local web tools, pending Apply, rollback, independent
reload snapshots and mode buttons. Requests and credentials are synthetic;
servers bind to loopback. Mode tests retain a unique temporary sandbox rather
than deleting an old fixed directory.

`vscodemodelswitch-0.4.0.vsix` was built and installed locally. Its 60 compiled
files matched the tested build and installation byte for byte. No Marketplace
release, live provider call or real client configuration change was performed.

After `Developer: Reload Window`, check the real webview:

1. The overview has Tool / Mode / Provider Name / Model ID / Status columns.
2. Official Codex needs no saved API source: show Official account, Signed in
   or Login required, and Client default when no model is configured. Signed in
   only detects locally stored login credentials, not remote session validity.
3. Current mode is explicit; Use Official Account and Apply API Provider are
   buttons. Already-active official mode disables its action to keep the login.
4. Use sandbox before testing a mode switch. Official authentication must be preserved; an API Apply must not overwrite a signed-in official identity.
   API Apply can select a saved source even when official mode had no active one.
5. Both Config editors expose proxy controls; Codex selects Responses or
   Anthropic upstream format. Saving should leave the applied route unchanged.

Visual rendering and real CLI/upstream acceptance remain manual checks. See
[native proxy protocol limits](native-proxy.md) before changing API format.

## Historical: Codex mode controls and Verify Model fix — v0.3.3 — 2026-10-21

The Codex section now exposes tool-level `Apply Official` and `Apply API` radio
actions. Official mode preserves `auth.json`; API mode requires its own identity and leaves Codex
ready for a fresh login, while API mode writes the selected API provider after
the clean reset. Codex API provider editing follows the Claude Code flow.

Validation completed:

- TypeScript check and compile passed.
- `scripts/test-codex-modes.js`: **8 passed, 0 failed**.
- `scripts/test-proxy.js`: **44 passed, 0 failed**.
- `vscodemodelswitch-0.3.3.vsix` was packaged and inspected for the new radio
  controls and compiled Codex adapter.
- Tests use sandbox paths and synthetic credentials; real Codex files and
  SecretStorage were not modified.

After installing the VSIX, run `Developer: Reload Window` and accept the first
official-mode login interactively in Codex. The real client login and provider
endpoints remain installation-time checks.

## Native proxy v0.2.0 validation — 2026-10-13

## Native proxy v0.2.1 host-proxy transport — 2026-10-17

`src/proxy/transport.ts` now uses the extension host's global `fetch` for
ordinary relay requests, retries and web tools. TypeScript check/compile passed;
the local suite completed **44 passed, 0 failed**, including an explicit test
that the shared transport calls `fetch`, preserves manual redirects, response
headers and response bytes. VSIX `vscodemodelswitch-0.2.1-host-proxy.vsix` was
packaged with the compiled proxy modules. No live provider request or client
configuration was changed. Install the new VSIX in the remote VS Code window
before doing AgentRouter end-to-end verification.

TypeScript check and compilation passed using the existing Node22 prefix.
`scripts/test-proxy.js` completed **43 passed, 0 failed** against loopback HTTP,
mocked VS Code APIs and the generated webview's JavaScript/DOM message flow.

The checks cover reconstructed/native SSE, terminal events/errors, JSON/tool
repair, paired history trimming, provider isolation, retries/cancellation,
WebFetch/image inputs, mixed web/client-tool deferral, Save/Apply/Verify
separation, metadata/config-write rollback, reload, terminal-only mode and
existing-provider UI editing/reset/cancel. They do not access provider keys or
the internet and do not write real CLI configuration files.

The VSIX `vscodemodelswitch-0.2.0-native-proxy.vsix` was built and its archive
checked for all six proxy modules, matching compiled files, workspace-host
metadata, usage documentation and the adapted modules' license/notice. Python
dependencies, auth files and test environments are absent from the archive.

No extension was installed or published. Visual rendering in a real VS Code
webview and actual Claude/justdowork end-to-end behavior remain to be accepted
after installation. These local results do not supersede the separate relay
availability test. Evidence: Interface `.ai/results/HO-20261013-002-result.md`.

## 1. Compile

```bash
npm ci
npm run check
npm run compile
```

Expected result:

- TypeScript compilation completes without errors.
- `out/` contains the compiled extension.

## 2. Start Mock Model Server

```bash
npm run mock:models
```

Use this endpoint in the extension:

```text
http://localhost:8787
```

Use any non-empty API key:

```text
test-key
```

The mock server supports:

```text
GET /v1/models
GET /models
GET /user/balance
POST /v1/messages
POST /v1/responses
```

## 3. Run Extension Development Host

In VSCode:

1. Open this folder.
2. Press `F5`.
3. A new Extension Development Host window opens.
4. Click the VSCodeModelSwitch icon in the Activity Bar.
5. Use the side bar Providers UI.

Add a provider:

```text
Tool: Claude Code
Name: Local Mock
Base URL: http://localhost:8787
Key: test-key
Click Fetch Models
Model ID: choose/type claude-sonnet-4-20250514, or leave it empty
Set active after saving: unchecked
Save Provider
Click Apply on the saved provider
```

Add another provider:

```text
Tool: Codex
Name: Local Mock Codex
Base URL: http://localhost:8787
Key: test-key
Click Fetch Models
Model ID: choose/type gpt-5-codex, or leave it empty
Set active after saving: unchecked
Save Provider
Click Apply on the saved provider
```

Expected result:

- Model fetch succeeds.
- The Claude Code provider list shows `Local Mock` as active.
- The Codex provider list shows `Local Mock Codex` as active.
- Each provider is displayed as one compact row with name, model, and row-level actions.
- Non-active providers show `Apply`; active providers show `Active`.
- The row-level `Model` button fetches models for that provider and lets you choose a new model.
- `Config` edits the stored complete configuration and key for one provider.
- `Applied Config` opens the effective configuration file for a tool.
- A provider without a model shows `NULL`; Apply remains available while
  `Verify Model` remains disabled.
- The VSCode status bar shows separate Claude and Codex entries with provider/model.
- If the active config file is edited externally, the status bar should update after the file watcher fires.

To validate synced-provider behavior:

1. Export a public config.
2. Import it in a fresh Extension Development Host profile or after clearing secrets.
3. Provider rows should show `Key missing on this machine`.
4. Click that provider's `Config` button.
5. Enter `test-key` in the API Key field and save.
6. `Apply` and `Model` should become available again.

- Global config sync is enabled by default and writes to real config files by default.
- Set `vscodemodelswitch.configTarget` to `sandbox` before testing if you do not want to touch real `~/.claude` and `~/.codex`.

The Command Palette commands still work, but the side bar UI is the primary flow.

## 4. Validate Terminal Env

Click `Terminal` in the corresponding provider group to apply and open its CLI.
For environment validation, interrupt the launched CLI and check without printing
the secret value:

```bash
echo $ANTHROPIC_BASE_URL
echo $OPENAI_BASE_URL
test -n "$ANTHROPIC_AUTH_TOKEN" && echo ANTHROPIC_AUTH_TOKEN=set
test -n "$OPENAI_API_KEY" && echo OPENAI_API_KEY=set
```

Expected:

```text
http://localhost:8787
http://localhost:8787
ANTHROPIC_AUTH_TOKEN=set
OPENAI_API_KEY=set
```

Click `Claude Terminal` in the side bar, or run:

```text
VSCodeModelSwitch: Open Claude Terminal
```

In the created terminal:

```bash
echo $ANTHROPIC_BASE_URL
test -n "$ANTHROPIC_AUTH_TOKEN" && echo ANTHROPIC_AUTH_TOKEN=set
```

Expected:

```text
http://localhost:8787
ANTHROPIC_AUTH_TOKEN=set
```

Click `Codex Terminal` in the side bar, or run:

```text
VSCodeModelSwitch: Open Codex Terminal
```

In the created terminal:

```bash
echo $OPENAI_BASE_URL
test -n "$OPENAI_API_KEY" && echo OPENAI_API_KEY=set
```

Expected:

```text
http://localhost:8787
OPENAI_API_KEY=set
```

The command also sends `claude` or `codex` automatically. For pure env testing, interrupt that command and run the `echo` checks.

## 5. Validate Safe Global CLI Sync

By default, config files are written under:

```text
~/.claude/settings.json
~/.codex/config.toml
```

To use sandbox mode, set workspace settings in the Extension Development Host:

```json
{
  "vscodemodelswitch.globalCliSync": true,
  "vscodemodelswitch.configTarget": "sandbox",
  "vscodemodelswitch.testHome": ""
}
```

Click `Apply` on each provider card.

Expected files:

```text
<workspace>/.vscodemodelswitch-home/.claude/settings.json
<workspace>/.vscodemodelswitch-home/.codex/config.toml
```

No real files under your actual home directory should be touched in sandbox mode.

Use `Applied Config` in each provider group to open the generated file directly.
Apply a provider a second time and verify that a backup exists under:

```text
<workspace>/.vscodemodelswitch-home/.claude/vscodemodelswitchbak/
<workspace>/.vscodemodelswitch-home/.codex/vscodemodelswitchbak/
```

Use this default setting when you are ready to write real machine config:

```json
{
  "vscodemodelswitch.configTarget": "real"
}
```

## 6. Validate Public Import/Export

Click `Export` and `Import` in the VSCodeModelSwitch side bar, or run:

```text
VSCodeModelSwitch: Export Public Config
VSCodeModelSwitch: Import Public Config
```

Expected:

- Exported JSON contains provider metadata.
- Exported JSON does not contain API keys.
- After importing on another machine, status should indicate missing key until local keys are entered.

Search the exported file for the mock key. The command must produce no output:

```bash
rg -n 'test-key' /path/to/exported-config.json
```

## 7. Validate Full Configuration

1. Select `Full configuration` in Add Provider.
2. Fill the Base URL and API key at the recognized template locations.
3. Leave `model` and Claude `effortLevel` empty, then save.
4. Confirm the provider appears with Model ID `NULL` and is not automatically active.
5. Open `Config`, add a model, click `Save`, and verify that the card updates.
6. Add a duplicate JSON/TOML field and verify that Save reports a validation error.

## 8. Validate Network, Usage And Cleanup

For each mock provider:

1. Click `Network & Usage`; network and Models API should pass.
2. Open `Config`, enable Usage Query, select `Auto Detect`, save, and run
   `Network & Usage` again. The mock remaining quota is `12.5 USD`.
3. Use the automated proxy suites above for `Verify Model` completion/error
   checks. The standalone `mock:models` server only supplies a minimal JSON
   fixture and does not simulate a complete verified SSE/Responses answer;
   its HTTP200 must not be treated as model success.
4. Open `View -> Output`, select `VSCodeModelSwitch`, and confirm diagnostics
   contain no API key or raw response body.
5. Confirm the global status area shows log and backup sizes.
6. Test `Delete Log` and each tool's `Delete Backups` confirmation.
7. Delete a provider and verify that its applied config file and backups remain.

## 9. Package VSIX

```bash
npm run package
```

Expected:

- A `.vsix` file is generated.
- It can be installed from VSCode with `Extensions: Install from VSIX...`.
# v0.6.0 network proxy acceptance

Run `npm run test:network` for synthetic editor Apply/reapply/restore/failure
behavior, HTTP CONNECT with remote-name resolution, direct loopback bypass,
redirect credential/bypass behavior, SSE and cancellation, API compatibility
relay composition, and verified HTTPS fixture certificates. Run existing proxy,
Codex mode/protocol and speed suites for regressions. No real account/model
requests are needed for these tests.

Then install the new VSIX manually. Keep the working host TUN mode while
applying `http://127.0.0.1:12000`, restart clients and check a real conversation.
Only afterward test host system-proxy mode with TUN off. Test both clients and
the API compatibility relay if used; port/HTTPS/mock success cannot replace this
acceptance. Restore original settings via Disable / Restore before downgrade.
See [network proxy](network-proxy.md).

## v0.6.1 Apply snapshot regression

The editor fixture in `scripts/test-network.js` now gives each getConfiguration
handle a fixed get() snapshot, while inspect()/update() use the latest model,
matching the installed VS Code extension host. With this fixture, the v0.6.0
manager reproduces the user's false HTTP override error on first Apply. The fix
must pass first Apply, reapply, target changes, reload, restore and rollback;
real HTTP and Claude workspace overrides must still reject Apply without
leaving either client's settings or saved state changed. Use `npm run check`,
`npm run test:network` and `npm run test:proxy`. No live credentials/model calls
are involved; real UI Apply and system-proxy chat acceptance remain separate.

## v0.6.2 Network proxy state controls

`npm run test:proxy` now checks explicit Off/Enabled badges and state-specific
button styles/locks, immediate submit locking, duplicate click suppression,
URL/bypass equivalence, edited and reverted drafts, target selection, background
refresh, successful Apply/Restore, failure/retry and generic busy transitions.
The fixture runs the actual webview script with synthetic messages/settings;
it does not apply real client settings or claim visual browser acceptance.
TypeScript check/compile and 82 UI/relay checks pass. The existing Enabled
configuration is retained after installing/reloading this UI update.
