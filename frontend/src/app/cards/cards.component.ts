import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-cards',
  templateUrl: './cards.component.html',
  styleUrls: ['./cards.component.scss']
})
export class CardsComponent {
  cards = ['?', '1', '2', '3', '5', '8', '13', '21'];

  @Input() selection?: string;
  @Input() disabled = false;
  @Output() selectionChange = new EventEmitter<string>();

  choose(option: string): void {
    if (this.disabled) {
      return;
    }
    if (this.selection === option) {
      this.selection = undefined;
    } else {
      this.selection = option;
    }
    this.selectionChange.emit(this.selection);
  }
}
