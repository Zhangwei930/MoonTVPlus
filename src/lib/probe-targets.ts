import { AdminConfig } from '@/lib/admin.types';

export interface ProbeTargetEx {
  key: string;
  name: string;
  kind: 'cms' | 'url';
  endpoint: string;
  ua?: string;
}

/**
 * 汇总所有可巡检的源：CMS 视频源（JSON 结构校验）+ 直播/OpenList/Emby/
 * 漫画/书源（URL 可达性）。key 按类型加命名空间，避免与 CMS 源冲突。
 * 网盘（Cookie 有效性）与 Web 直播（无稳定 URL）暂不纳入。
 */
export function collectProbeTargets(config: AdminConfig): ProbeTargetEx[] {
  const targets: ProbeTargetEx[] = [];

  for (const site of config.SourceConfig || []) {
    if (site.disabled) continue;
    targets.push({ key: site.key, name: site.name, kind: 'cms', endpoint: site.api });
  }

  for (const live of config.LiveConfig || []) {
    if (live.disabled || !live.url) continue;
    targets.push({
      key: `live:${live.key}`,
      name: `直播-${live.name}`,
      kind: 'url',
      endpoint: live.url,
      ua: live.ua,
    });
  }

  if (config.OpenListConfig?.Enabled && config.OpenListConfig.URL) {
    targets.push({
      key: 'openlist',
      name: '私人影库(OpenList)',
      kind: 'url',
      endpoint: config.OpenListConfig.URL,
    });
  }

  const embySources = config.EmbyConfig?.Sources;
  if (embySources && embySources.length > 0) {
    for (const source of embySources) {
      if (!source.enabled || !source.ServerURL) continue;
      targets.push({
        key: `emby:${source.key}`,
        name: `Emby-${source.name}`,
        kind: 'url',
        endpoint: `${source.ServerURL.replace(/\/+$/, '')}/System/Info/Public`,
      });
    }
  } else if (config.EmbyConfig?.Enabled && config.EmbyConfig.ServerURL) {
    targets.push({
      key: 'emby',
      name: 'Emby',
      kind: 'url',
      endpoint: `${config.EmbyConfig.ServerURL.replace(/\/+$/, '')}/System/Info/Public`,
    });
  }

  if (config.SuwayomiConfig?.Enabled && config.SuwayomiConfig.ServerURL) {
    targets.push({
      key: 'suwayomi',
      name: '漫画展馆(Suwayomi)',
      kind: 'url',
      endpoint: config.SuwayomiConfig.ServerURL,
    });
  }

  if (config.OPDSConfig?.Enabled) {
    for (const source of config.OPDSConfig.Sources || []) {
      if (source.enabled === false || !source.url) continue;
      targets.push({
        key: `opds:${source.id}`,
        name: `书源-${source.name}`,
        kind: 'url',
        endpoint: source.url,
      });
    }
  }

  return targets;
}

