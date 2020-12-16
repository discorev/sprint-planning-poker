import { Component, OnDestroy } from '@angular/core';
import { WebSocketService } from '@app/services/web-socket.service';
import { Subject } from 'rxjs';
import { retryWhen, takeUntil, tap, delay } from 'rxjs/operators';
import { Person } from '@app/models/person.model';

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
  connected = false;
  private destroyed$ = new Subject();

  constructor(private socketService: WebSocketService) {
    this.socketService.openSubject$.pipe(
      takeUntil(this.destroyed$)
    ).subscribe(next => {
      jQuery('#connectingModal').modal('hide');
      this.connected = true;
    });
    this.socketService.closeSubject$.pipe(
      takeUntil(this.destroyed$)
    ).subscribe(next => {
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

  handleMessage(msg: any): void {
    if (msg.name && msg.selected !== undefined) {
      const idx = this.players.map(player => player.name).indexOf(msg.name);
      if (idx !== -1) {
        this.players[idx].selected = (msg.selected === true);
      } else {
        this.players.push({name: msg.name, selected: (msg.selected === true)});
      }
    }

    if (msg.players) {
      this.players = (msg.players as string[]).map((player: string) => {
        return {name: player, selected: false};
      });
      console.log(this.players);
    }

    if (msg.reset) {
      this.showReset = false;
      this.selection = undefined;
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
        } else {
          choice.selected = true;
          this.players.push(choice);
        }
      });
    }
    console.log(msg);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
  }
}
