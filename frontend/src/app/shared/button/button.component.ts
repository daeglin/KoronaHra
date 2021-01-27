import {Component, HostBinding, HostListener, Input, ViewChild} from '@angular/core';
import {MatButton} from '@angular/material/button';
import {ThemePalette} from '@angular/material/core';

@Component({
  selector: 'cvd-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  @Input()
  type: 'raised' | 'stroked' = 'stroked';

  @Input()
  themePalette: ThemePalette = undefined;

  @HostBinding('style.--color')
  @Input() color = '';

  @ViewChild('nativeButtonElement')
  _nativeButtonElement: MatButton | undefined;

  @HostBinding('tabindex')
  setTabIndex() {
    return '0';
  }

  @HostListener('focus')
  onFocus() {
    if (this._nativeButtonElement) {
      this._nativeButtonElement.focus(null, {preventScroll: true});
    }
  }
}
