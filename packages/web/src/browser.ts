/**
 * Lightweight browser / device / OS detection from User-Agent string.
 * No external dependencies — simple regex-based parsing.
 */

export type DeviceType = 'desktop' | 'mobile' | 'tablet';
export type AppPlatform = 'web-browser' | 'electron' | 'react-native';

export interface BrowserInfo {
  'browser.name': string;
  'browser.version': string;
  'os.name': string;
  'os.version': string;
  'device.type': DeviceType;
  'app.platform': AppPlatform;
}

export function detectBrowserInfo(platform?: AppPlatform): BrowserInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  return {
    'browser.name': detectBrowserName(ua),
    'browser.version': detectBrowserVersion(ua),
    'os.name': detectOsName(ua),
    'os.version': detectOsVersion(ua),
    'device.type': detectDeviceType(ua),
    'app.platform': platform ?? detectPlatform(),
  };
}

function detectBrowserName(ua: string): string {
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  return 'Unknown';
}

function detectBrowserVersion(ua: string): string {
  const patterns: [string, RegExp][] = [
    ['Edge', /Edg\/(\d+[\d.]*)/],
    ['Opera', /OPR\/(\d+[\d.]*)/],
    ['Chrome', /Chrome\/(\d+[\d.]*)/],
    ['Safari', /Version\/(\d+[\d.]*)/],
    ['Firefox', /Firefox\/(\d+[\d.]*)/],
  ];

  for (const [, regex] of patterns) {
    const match = ua.match(regex);
    if (match) return match[1];
  }
  return 'unknown';
}

function detectOsName(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('CrOS')) return 'ChromeOS';
  return 'Unknown';
}

function detectOsVersion(ua: string): string {
  const patterns: RegExp[] = [
    /Windows NT (\d+[\d.]*)/,
    /Mac OS X (\d+[_.\d]*)/,
    /Android (\d+[\d.]*)/,
    /iPhone OS (\d+[_\d]*)/,
    /iPad.*OS (\d+[_\d]*)/,
  ];

  for (const regex of patterns) {
    const match = ua.match(regex);
    if (match) return match[1].replace(/_/g, '.');
  }
  return 'unknown';
}

function detectDeviceType(ua: string): DeviceType {
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|iPhone|Android.*Mobile|iPod|Opera Mini|IEMobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectPlatform(): AppPlatform {
  // Electron detection
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return 'electron';
  }
  // React Native would not have document/window in the same way,
  // but this runs in a browser context by default
  return 'web-browser';
}
