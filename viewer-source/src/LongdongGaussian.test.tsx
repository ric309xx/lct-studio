import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LongdongGaussian, LONGDONG_GAUSSIAN_URL } from './LongdongGaussian';

describe('Longdong Gaussian presentation', () => {
  it('embeds the upright scene, states its limitations and can close', () => {
    const close = vi.fn();
    render(<LongdongGaussian onClose={close} />);
    expect(screen.getByTitle('龍洞 Pix4D 高斯模型')).toHaveAttribute('src', LONGDONG_GAUSSIAN_URL);
    expect(screen.getByText(/尚未完成地理座標對位/)).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /另開 SuperSplat/})).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('button', {name: '關閉高斯模型'}));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
