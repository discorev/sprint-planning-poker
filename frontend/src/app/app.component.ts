import { Component, OnDestroy } from '@angular/core';
import { WebSocketService } from '@app/services/web-socket.service';
import { PlayerService } from '@app/services/player.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Person } from '@app/models/person.model';

import * as confetti from 'canvas-confetti';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {
  selection?: string;
  name: string;
  registered = false;
  error?: string;
  showReset = false;
  confetti = false;
  connected = false;
  private destroyed$ = new Subject();

  constructor(private socketService: WebSocketService, private playerService: PlayerService) {
    this.name = '';
    this.socketService.openSubject$.pipe(
      takeUntil(this.destroyed$)
    ).subscribe(_ => {
      jQuery('#connectingModal').modal('hide');
      this.connected = true;
    });
    this.socketService.closeSubject$.pipe(
      takeUntil(this.destroyed$)
    ).subscribe(_ => {
      jQuery('#connectingModal').modal('show');
      this.connected = false;
    });
    this.socketService.onMessage$.pipe(
      takeUntil(this.destroyed$)
    ).subscribe(msg => this.handleMessage(msg));
  }

  get players(): Person[] {
    return this.playerService.listPlayers();
  }

  selectionChanged(newSelection: string): void {
    this.socketService.send({choice: newSelection, action: 'record-choice'});
  }

  sendReset(): void {
    this.socketService.send({action: 'reset'});
  }

  snoozePlayer(player: Person): void {
    this.socketService.send({action: 'snooze', player: player.name});
  }

  handleMessage(msg: any): void {
    if (msg.name && msg.selected !== undefined) {
      const player = this.playerService.findByName(msg.name);
      if (player) {
        player.selected = (msg.selected === true);
        player.snoozed = false;
      } else {
        this.playerService.add({name: msg.name, choice: undefined, selected: (msg.selected === true), snoozed: false, observer: false});
      }
    }

    if (msg.players) {
      this.playerService.clear();
      (msg.players as Person[]).forEach(player => this.playerService.add(player));
      console.log(this.playerService.listPlayers());
    }

    if (msg.action && msg.action === 'snooze') {
      const player = this.playerService.findByName(msg.player);
      if (player) {
        player.snoozed = msg.snoozed;
      }
    }

    if (msg.reset) {
      this.showReset = false;
      this.selection = undefined;
      this.confetti = false;
      this.playerService.reset();
    }

    if (msg.choices) {
      this.showReset = true;
      msg.choices.forEach((choice: Person) => {
        // find the matching player and update their choice
        const player = this.playerService.findByName(choice.name);
        if (player) {
          player.choice = choice.choice;
          player.selected = choice.choice !== null;
          player.snoozed = choice.snoozed;
        } else {
          choice.selected = true;
          this.playerService.add(choice);
        }
      });

      // Check if it's time to celebrate
      if (this.isTimeToCelebrate()) {
        this.confetti = true;
        // @ts-ignore
        confetti.create(null, { resize: true })({
          particleCount: 100,
          spread: 90,
          origin: {
            y: (1),
            x: (0.5)
          }
        });
      }
    }
    console.log(msg);
  }

  isTimeToCelebrate(): boolean {
    // Check that the cannon has not already fired for this round
    if (this.confetti) {
      return false;
    }

    return this.playerService.allAgree();
  }

  isObserver(): boolean {
    const self = this.playerService.listPlayers().find(person => person.name === this.name);
    if (self) {
      return self.observer;
    }
    return false;
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
  }
}
