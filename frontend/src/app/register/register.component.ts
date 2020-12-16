import { Component, EventEmitter, Output, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { WebSocketService } from '@app/services/web-socket.service';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html'
})
export class RegisterComponent implements OnDestroy {

  error = '';
  name = '';
  submitted = false;

  constructor(private webSocketService: WebSocketService) {
  }

  @Output() registeredChange = new EventEmitter<boolean>();
  private destroyed$ = new Subject();

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
