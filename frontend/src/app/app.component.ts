import { Component, OnDestroy } from '@angular/core';
import { WebSocketService } from '@app/services/web-socket.service';
import { Subject } from 'rxjs';
import { retryWhen, takeUntil, tap, delay } from 'rxjs/operators';
import { Person } from '@app/person.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnDestroy {
  name = '';
  selection?: string;
  registered = false;
  error?: string;
  submitted = false;
  players: Person[] = [];
  showReset = false;
  connected = false;
  private destroyed$ = new Subject();

  constructor(private socketService: WebSocketService) {
    const socket$ = this.socketService.connect().pipe(
      retryWhen(errors => errors.pipe(
        tap(err => {
          console.error('Got error', err);
          this.connected = false;
          jQuery('#connectingModal').modal('show');
        }),
        delay(1000)
      )),
      takeUntil(this.destroyed$),
    );
    this.socketService.openSubject$.pipe(
      takeUntil(this.destroyed$)
    ).subscribe(next => {
      jQuery('#connectingModal').modal('hide');
      this.connected = true;
      if (this.registered && this.name !== 'observeronly') {
        this.socketService.send({action: 'register', name: this.name});
      }
    });
    socket$.subscribe(
      (msg) => this.handleMessage(msg),
      (err) => console.log(err),
      () => console.log('complete')
    );
  }

  register(): void {
    if (this.name === 'observeronly') {
      this.registered = true;
      return;
    }
    this.submitted = true;
    console.log('Registering', this.name);
    this.socketService.send({action: 'register', name: this.name});
  }

  selectionChanged(newSelection: string): void {
    this.socketService.send({choice: newSelection, action: 'record-choice'});
  }

  sendReset(): void {
    this.socketService.send({action: 'reset'});
  }

  handleMessage(msg: any): void {
    this.connected = true;
    if (!this.registered) {
      if (msg.error) {
        this.submitted = false;
        this.error = msg.error;
      } else {
        this.registered = true;
        console.log('registered');
      }
    }

    if (msg.name && msg.selected !== undefined) {
      const idx = this.players.map(player => player.name).indexOf(msg.name);
      if (idx !== -1) {
        this.players[idx].selected = (msg.selected === true);
      } else {
        this.players.push({name: msg.name, selected: (msg.selected === true)});
      }
    }

    if (msg.players) {
      this.players = msg.players.map((player: string) => {
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
