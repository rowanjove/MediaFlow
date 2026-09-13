export type Lang = 'zh' | 'en';

export const translations: Record<Lang, Record<string, string>> = {
  zh: {
    'brand.status': 'Edge Ready',
    'theme.toggle': '切换色彩主题',
    'lang.toggle': 'EN',
    'hero.badge_mode': 'Worker Native',
    'hero.badge_cdn': '直连原站 CDN',
    'hero.title': '多平台媒体解析',
    'hero.desc': '粘贴公开分享链接或口令全文，识别平台并给出去水印直链。文件由浏览器直连原站下载。',
    'input.placeholder': '粘贴分享口令或链接，支持抖音/小红书等全文',
    'input.paste': '粘贴',
    'input.parse': '立即解析',
    'input.tip': '不必清理文案，口令里夹着链接也可以直接解析。',
    'input.error_title': '解析遇到问题',
    'input.empty_tip': '请输入需要解析的链接或分享文本',
    'input.network_err': '无法连通解析服务，请检查网络连接',
    'result.source': '原链接',
    'result.copy_json': 'JSON',
    'result.images_prefix': '共 ',
    'result.images_suffix': ' 张高清图片',
    'result.open_all': '批量打开原图',
    'result.audio_title': '背景音乐 / 原声音频',
    'result.audio_desc': '独立音频直链',
    'result.audio_download': '下载音频',
    'result.video_download': '下载无水印视频',
    'result.audio_track': '提取音频',
    'platform.heading': 'SUPPORTED PLATFORMS',
    'platform.more': '查看更多',
    'platform.collapse': '收起',
    'platform.stable': '稳定',
    'platform.beta': '试验',
    'platform.unavailable': '不可用',
    'footer.direct': 'Direct CDN',
    'footer.faq': '常见问题 FAQ',
  },
  en: {
    'brand.status': 'Edge Ready',
    'theme.toggle': 'Toggle Theme',
    'lang.toggle': '中',
    'hero.badge_mode': 'Worker Native',
    'hero.badge_cdn': 'Direct CDN',
    'hero.title': 'Multi-Platform Media Parser',
    'hero.desc': 'Parse public media links and extract direct watermark-free CDN links. Download directly with zero intermediary proxy.',
    'input.placeholder': 'Paste share link or text (Douyin, TikTok, YouTube, Bilibili...)',
    'input.paste': 'Paste',
    'input.parse': 'Parse',
    'input.tip': 'Raw share texts containing URLs are automatically extracted without pre-cleaning.',
    'input.error_title': 'Parsing Error',
    'input.empty_tip': 'Please enter a valid link or share text to parse',
    'input.network_err': 'Failed to connect to parser service. Please check network.',
    'result.source': 'Source',
    'result.copy_json': 'JSON',
    'result.images_prefix': 'Total ',
    'result.images_suffix': ' High-Res Images',
    'result.open_all': 'Open All Images',
    'result.audio_title': 'Soundtrack / Audio',
    'result.audio_desc': 'Direct Audio Stream',
    'result.audio_download': 'Download Audio',
    'result.video_download': 'Download Video',
    'result.audio_track': 'Audio Track',
    'platform.heading': 'SUPPORTED PLATFORMS',
    'platform.more': 'Show More',
    'platform.collapse': 'Collapse',
    'platform.stable': 'Stable',
    'platform.beta': 'Beta',
    'platform.unavailable': 'Unavailable',
    'footer.direct': 'Direct CDN',
    'footer.faq': 'FAQ',
  }
};

export function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'zh';
  const saved = localStorage.getItem('app_lang') as Lang;
  if (saved === 'zh' || saved === 'en') return saved;
  const navLang = navigator.language?.toLowerCase() || '';
  return navLang.startsWith('zh') ? 'zh' : 'en';
}

export function applyLanguage(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  localStorage.setItem('app_lang', lang);

  const dict = translations[lang];

  // Update elements with data-i18n
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key && dict[key]) {
      el.textContent = dict[key];
    }
  });

  // Update elements with data-i18n-placeholder
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key && dict[key]) {
      el.placeholder = dict[key];
    }
  });

  // Update elements with data-i18n-title
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key && dict[key]) {
      el.title = dict[key];
    }
  });

  // Update lang button text
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.textContent = lang === 'zh' ? 'EN' : '中';
  }

  // Dispatch custom event for dynamic components like platform list and parse app
  window.dispatchEvent(new CustomEvent('app:language-changed', { detail: { lang, dict } }));
}
