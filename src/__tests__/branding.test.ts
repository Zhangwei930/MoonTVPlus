import { readFileSync } from 'fs';
import path from 'path';

const projectRoot = process.cwd();

const defaultBrandingFiles = [
  'scripts/generate-manifest.js',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/api/server-config/route.ts',
  'src/app/warning/page.tsx',
  'src/components/AIChatPanel.tsx',
  'src/components/BannerCarousel.tsx',
  'src/components/SiteProvider.tsx',
  'src/lib/ai-orchestrator.ts',
  'src/lib/config.ts',
];

describe('frontend branding', () => {
  it('uses MagiesTvPlus for user-facing default branding', () => {
    const combinedSource = defaultBrandingFiles
      .map((filePath) =>
        readFileSync(path.join(projectRoot, filePath), 'utf8')
      )
      .join('\n');

    expect(combinedSource).toContain('MagiesTvPlus');
    expect(combinedSource).not.toContain('MoonTVPlus');
    expect(combinedSource).not.toContain('MoonTvPlus');
  });

  it('uses MagiesTvPlus for visible client app labels', () => {
    const userMenuSource = readFileSync(
      path.join(projectRoot, 'src/components/UserMenu.tsx'),
      'utf8'
    );

    expect(userMenuSource).toContain('MagiesTvPlus-PC客户端');
    expect(userMenuSource).toContain("alt='MagiesTvPlus-PC'");
    expect(userMenuSource).not.toContain('MoonTVPlus-PC客户端');
    expect(userMenuSource).not.toContain("alt='MoonTVPlus-PC'");
  });
});
