import { Injectable, OnDestroy } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/WebSocket';
import { Observable, Subject } from 'rxjs';

import { environment } from '@env/environment';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService implements OnDestroy {
  // Holds the connection to the websocket
  private socket$?: WebSocketSubject<any>;
  public openSubject$ = new Subject();
  public closeSubject$ = new Subject();

  /**
   * Connect to the websocket
   * @returns Observable for messages sent from the server.
   */
  public connect(): Observable<any> {
    if (!this.socket$ || this.socket$.closed) {
      this.socket$ = webSocket({
        url: environment.websocket_api,
        openObserver: this.openSubject$,
        closeObserver: this.closeSubject$
      });
      this.closeSubject$.subscribe(test => {
        console.log(test);
      });
    }
    return this.socket$;
  }

  /**
   * Send a message to the websocket
   * @param msg Message to send
   */
  public send(msg: any): void {
    if (this.socket$ && !this.socket$.closed) {
      this.socket$.next(msg);
    }
  }

  /**
   * Close the websocket
   */
  public close(): void {
    if (this.socket$) {
      this.socket$.complete();
      this.openSubject$.complete();
      this.closeSubject$.complete();
      this.socket$ = undefined;
    }
  }

  ngOnDestroy(): void {
    this.close();
  }
}
