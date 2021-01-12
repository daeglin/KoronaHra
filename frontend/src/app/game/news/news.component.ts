import {ChangeDetectorRef, Component} from '@angular/core';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {GameService} from '../game.service';

@UntilDestroy()
@Component({
  selector: 'cvd-news',
  templateUrl: './news.component.html',
  styleUrls: ['./news.component.scss'],
})
export class NewsComponent {
  constructor(public gameService: GameService, cd: ChangeDetectorRef) {
    this.gameService.gameState$
      .pipe(untilDestroyed(this))
      .subscribe(() => cd.markForCheck());
  }

  get today() {
    return new Date(this.gameService.lastDate).toLocaleDateString();
  }

  hasNamedEventMitigation() {
    return this.gameService.game.eventMitigations.find(m => m.name);
  }

  isFinite(value: number) {
    return value < Infinity;
  }
}
