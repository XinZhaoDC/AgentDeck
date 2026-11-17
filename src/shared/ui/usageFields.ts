import { USAGE_PRESETS } from '../../models/usagePresets';

export function usagePresetOptions(): string {
  return USAGE_PRESETS.map(preset => `<option value="${preset.id}">${preset.label}</option>`).join('');
}

/** Public balance query settings, shared by the two client group editors.
 * Provider credentials remain in the existing individual provider editor. */
export function renderGroupUsageFields(prefix: string): string {
  return `<details class="settingsSection"><summary><h4>API 余额查询设置</h4></summary><div class="settingsBody">
    <label class="check"><input id="${prefix}UsageEnabled" type="checkbox">启用余额查询</label>
    <div id="${prefix}UsageFields" class="field" hidden>
      <label for="${prefix}UsagePreset">查询预设</label><select id="${prefix}UsagePreset">
        ${usagePresetOptions()}
      </select>
      <div id="${prefix}UsagePresetHint" class="usageNote"></div>
      <details id="${prefix}UsageCustom" class="settingsSection" hidden><summary>接口、字段与换算参数</summary><div class="settingsBody">
        ${[['Url','余额接口地址','{{baseUrl}}/user/balance'],['RemainingPath','剩余额度 JSON 路径','data.balance'],['UsedPath','已用额度 JSON 路径（可选）',''],['TotalPath','总额度 JSON 路径（可选）',''],['Unit','显示单位','USD']].map(([id,label,hint]) => `<label for="${prefix}Usage${id}">${label}</label><input id="${prefix}Usage${id}" type="text" placeholder="${hint}">`).join('')}
        <label for="${prefix}UsageDivisor">数值除数</label><input id="${prefix}UsageDivisor" type="number" min="0.000001" step="any" value="1">
      </div></details>
    </div>
    <p class="usageNote">ⓘ 注：这里只保存查询规则；{{baseUrl}} 为原供应商地址，{{rootUrl}} 去除末尾 /v1，{{apiBaseUrl}} 确保末尾有 /v1。API 密钥、管理令牌及管理用户 ID 由各供应商单独保存；载入时不覆盖已有凭据。</p>
  </div></details>`;
}
