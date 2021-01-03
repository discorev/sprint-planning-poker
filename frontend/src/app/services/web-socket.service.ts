import { Injectable, OnDestroy } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Observable, Subject, of } from 'rxjs';

import { environment } from '@env/environment';
import { Person } from '@app/models/person.model';
import { delay, retryWhen, tap } from 'rxjs/operators';

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

  constructor() {
    this.socket$ = webSocket({
      url: environment.websocket_api,
      openObserver: this.openSubject$,
      closeObserver: this.closeSubject$
    });
    this.socket$.pipe(
      retryWhen(errors => errors.pipe(
        tap(err => {
          console.error('Got error', err);
        }),
        delay(1000)
      ))
    ).subscribe(
      (msg) => this.handleMessage(msg),
      (err) => console.log(err),
      () => console.log('complete')
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
    return this.hasRegistered$;
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
    if (!this.isRegistered) {
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

    if (msg.name && msg.selected !== undefined) {
      const person = msg as Person;
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
