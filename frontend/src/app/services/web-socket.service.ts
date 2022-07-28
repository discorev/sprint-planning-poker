import { Injectable, OnDestroy } from '@angular/core';
import { WebSocketSubject } from 'rxjs/webSocket';
import { Observable, Subject, of } from 'rxjs';

import { environment } from '@env/environment';
import { delay, retryWhen, tap } from 'rxjs/operators';
import { WebSocketClientService } from '@app/services/web-socket-client.service';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService implements OnDestroy {
  // Holds the connection to the websocket
  private socket$?: WebSocketSubject<any>;
  private isRegistered = false;
  private hasRegistered$ = new Subject<boolean>();

  public openSubject$ = new Subject();
  public closeSubject$ = new Subject();
  public onMessage$ = new Subject();
  public lastError?: string;

  constructor(private webSocketClient: WebSocketClientService) {
    webSocketClient.onOpen$.subscribe(event => this.openSubject$.next(event));
    webSocketClient.onClose$.subscribe(event => this.closeSubject$.next(event));
    const websocket_api_url = (window.location.protocol === "https:") ? "wss://" : "ws://" + window.location.host + environment.websocket_api
    this.socket$ = this.webSocketClient.connect(websocket_api_url);
    this.socket$.pipe(
      retryWhen(errors => errors.pipe(
        tap(err => {
          console.error('Got error', err);
        }),
        delay(1000)
      ))
    ).subscribe(
      (msg) => this.handleMessage(msg)
    );
    // Remove the name from local storage
    localStorage.removeItem('name');
    // Setup a subscription to re-send the registration when the socket reconnects
    this.openSubject$.subscribe(_ => {
      if (this.isRegistered) {
        // tslint:disable-next-line:no-shadowed-variable
        const name = localStorage.getItem('name');
        if (name) {
          this.send({action: 'register', name});
        }
      }
    });
  }

  /**
   * Register the user and return a boolean once it's confirmed it was successful.
   * @param name - The name to register with
   */
  public register(name: string): Observable<boolean> {
    if (!this.socket$ || this.socket$.closed) {
      return of(false);
    }
    // send a message registering the user
    localStorage.setItem('name', name);
    this.socket$.next({action: 'register', name});
    return this.hasRegistered$.asObservable();
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
   * Handle a message from the websocket
   * @param msg - the recieved message
   */
  handleMessage(msg: any): void {
    if (!this.isRegistered && msg.action === 'register') {
      if (msg.error) {
        localStorage.removeItem('name');
        this.lastError = msg.error;
        this.hasRegistered$.next(false);
      } else {
        this.isRegistered = true;
        this.hasRegistered$.next(true);
        console.log('registered');
      }
    }

    this.onMessage$.next(msg);
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
