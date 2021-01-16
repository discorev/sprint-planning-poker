import { Injectable, OnDestroy } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebSocketClientService implements OnDestroy {
  private socket$?: WebSocketSubject<any>;
  public readonly onOpen$ = new Subject();
  public readonly onClose$ = new Subject();
  constructor() { }

  public connect(address: string): WebSocketSubject<any> {
    this.socket$ = webSocket({
      url: address,
      openObserver: this.onOpen$,
      closeObserver: this.onClose$
    });
    return this.socket$;
  }

  ngOnDestroy(): void {
    this.socket$?.complete();
  }
}
