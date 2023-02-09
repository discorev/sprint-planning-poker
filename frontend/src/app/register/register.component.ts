import { Component, EventEmitter, Input, Output, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { WebSocketService } from '@app/services/web-socket.service';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html'
})
export class RegisterComponent implements OnDestroy {

  error = '';
  submitted = false;

  constructor(private webSocketService: WebSocketService) {
  }

  @Input() name!: string;
  @Output() nameChange = new EventEmitter<string>();

  @Output() registeredChange = new EventEmitter<boolean>();
  private destroyed$ = new Subject();

  nameChanged(newName: string): void {
    this.name = newName;
    this.nameChange.emit(newName);
  }

  register(): void {
    // Do something
    this.error = '';
    this.webSocketService.register(this.name).pipe(
      takeUntil(this.destroyed$)
    ).subscribe(result => {
      if (!result) {
        this.error = this.webSocketService.lastError ?? '';
      }
      this.registeredChange.emit(result);
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
  }

}
