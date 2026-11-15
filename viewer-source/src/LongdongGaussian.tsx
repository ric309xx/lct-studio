import { useEffect } from 'react';

export const LONGDONG_GAUSSIAN_URL = 'https://superspl.at/s?id=01ecdfac';
export const LONGDONG_GAUSSIAN_SCENE = 'https://superspl.at/scene/01ecdfac';

export function LongdongGaussian({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <section className="gaussian-overlay" role="dialog" aria-modal="true" aria-label="龍洞 Pix4D 高斯模型">
    <header className="gaussian-header">
      <div><strong>龍洞｜Pix4D 高斯模型</strong><span>2026/08/05 · 獨立展示</span></div>
      <button type="button" onClick={onClose} aria-label="關閉高斯模型">返回 3D 專案</button>
    </header>
    <iframe title="龍洞 Pix4D 高斯模型" src={LONGDONG_GAUSSIAN_URL} allow="fullscreen" allowFullScreen />
    <footer className="gaussian-footer">
      <span>僅供視覺展示，尚未完成地理座標對位，不適用精準量測。SuperSplat 不公開列出，但知道連結者仍可觀看。</span>
      <a href={LONGDONG_GAUSSIAN_SCENE} target="_blank" rel="noopener noreferrer">另開 SuperSplat ↗</a>
    </footer>
  </section>;
}
