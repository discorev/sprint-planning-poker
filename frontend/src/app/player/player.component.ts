import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Person } from '@app/models/person.model';

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.scss']
})
export class PlayerComponent {
  @Input() data!: Person;
  @Output() snoozeClicked = new EventEmitter<boolean>();
}
