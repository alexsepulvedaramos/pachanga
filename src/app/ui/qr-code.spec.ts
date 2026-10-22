import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { QrCode } from './qr-code';

describe('QrCode', () => {
  it('draws the link as a square QR code', () => {
    const fixture = TestBed.createComponent(QrCode);
    fixture.componentRef.setInput('value', 'https://pachanga.app/t/ABCD');
    fixture.componentRef.setInput('label', 'QR para abrir Liga');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(21);
    expect(svg.getAttribute('aria-label')).toBe('QR para abrir Liga');
    expect(svg.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(100);
  });
});
