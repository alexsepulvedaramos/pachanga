import { Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/** A QR code for a link, drawn as SVG on a white tile so phones read it on any screen. */
@Component({
  selector: 'app-qr-code',
  host: { class: 'block bg-white p-[0.6em]' },
  template: `
    <svg [attr.viewBox]="'0 0 ' + code().size + ' ' + code().size" class="block size-full" shape-rendering="crispEdges" role="img" [attr.aria-label]="label()">
      <path [attr.d]="code().path" fill="#060a15" />
    </svg>
  `,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly label = input('Código QR');

  protected readonly code = computed(() => {
    const qr = qrcode(0, 'M');
    qr.addData(this.value());
    qr.make();
    const size = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size, path };
  });
}
