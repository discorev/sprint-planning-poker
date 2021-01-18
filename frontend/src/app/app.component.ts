import { Component, OnDestroy } from '@angular/core';
import { WebSocketService } from '@app/services/web-socket.service';
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
  registered = false;
  error?: string;
  players: Person[] = [];
  showReset = false;
  confetti = false;
  connected = false;
  private destroyed$ = new Subject();

  constructor(private socketService: WebSocketService) {
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
      const idx = this.players.map(player => player.name).indexOf(msg.name);
      if (idx !== -1) {
        this.players[idx].selected = (msg.selected === true);
        this.players[idx].snoozed = false;
      } else {
        this.players.push({name: msg.name, selected: (msg.selected === true), snoozed: false});
      }
    }

    if (msg.players) {
      this.players = (msg.players as string[]).map((player: string) => {
        return {name: player, selected: false, snoozed: false};
      });
      console.log(this.players);
    }

    if (msg.action && msg.action === 'snooze') {
      const idx = this.players.map(player => player.name).indexOf(msg.player);
      if (idx !== -1) {
        this.players[idx].snoozed = msg.snoozed;
      }
    }

    if (msg.reset) {
      this.showReset = false;
      this.selection = undefined;
      this.confetti = false;
      this.players.forEach(player => {
        player.choice = undefined;
        player.selected = false;
      });
    }

    if (msg.choices) {
      this.showReset = true;
      msg.choices.forEach((choice: Person) => {
        // find the matching player and update their choice
        const idx = this.players.map(player => player.name).indexOf(choice.name);
        if (idx !== -1) {
          this.players[idx].choice = choice.choice;
          this.players[idx].selected = true;
          this.players[idx].snoozed = choice.snoozed;
        } else {
          choice.selected = true;
          this.players.push(choice);
        }
      });
      // Find the first choice made by a non-snoozed player
      const firstChoice = msg.choices.find((person: Person) => person.snoozed === false);
      // Check that every player's choice matches that, except snoozed players
      if (msg.choices.every((choice: Person) => (choice.choice === firstChoice || choice.snoozed))) {
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

  ngOnDestroy(): void {
    this.destroyed$.next();
  }
}
