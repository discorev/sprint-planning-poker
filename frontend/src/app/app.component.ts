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
  players: Person[] = [];
  private destroyed$ = new Subject();

  constructor(private socketService: WebSocketService) {}

  register(): void {
    console.log('Registering', this.name);
    const socket$ = this.socketService.connect(this.name).pipe(
      retryWhen(errors => errors.pipe(
        tap(err => {
          console.error('Got error', err);
        }),
        delay(1000)
      )),
      takeUntil(this.destroyed$),
    );
    socket$.subscribe(
      (msg) => this.handleMessage(msg),
      (err) => console.log(err),
      () => console.log('complete')
    );
  }

  selectionChanged(newSelection: string): void {
    this.socketService.send({choice: newSelection, action: 'record-choice'});
  }

  handleMessage(msg: any): void {
    if (!this.registered) {
      if (msg.error) {
        // Display the error
        console.error(msg);
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
      this.selection = undefined;
      this.players.forEach(player => {
        player.choice = undefined;
        player.selected = false;
      });
    }

    if (msg.choices) {
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
