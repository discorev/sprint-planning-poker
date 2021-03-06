import { TestBed } from '@angular/core/testing';

import { WebSocketService } from './web-socket.service';
import { WebSocketClientService } from '@app/services/web-socket-client.service';
import { Subject } from 'rxjs';
import { WebSocketSubject } from 'rxjs/webSocket';
import { first } from 'rxjs/operators';
import { AnonymousSubject } from 'rxjs/internal/Subject';


describe('WebSocketService', () => {
  let service: WebSocketService;
  let webSocketClientSpy: jasmine.SpyObj<WebSocketClientService>;
  let onOpen$: Subject<any>;
  let onClose$: Subject<any>;
  let socketSubject$: AnonymousSubject<any>;
  let socketDestinationSubject$: Subject<any>;
  let socketSourceSubject$: Subject<any>;

  beforeEach(() => {
    onOpen$ = new Subject<any>();
    onClose$ = new Subject<any>();
    socketDestinationSubject$ = new Subject<any>();
    socketSourceSubject$ = new Subject<any>();
    socketSubject$ = new AnonymousSubject(socketDestinationSubject$, socketSourceSubject$.asObservable());

    const spy = jasmine.createSpyObj(
      'WebSocketClientService',
      ['connect'], {
        onOpen$, onClose$
    });
    spy.connect.and.returnValue(socketSubject$ as unknown as WebSocketSubject<any>);
    TestBed.configureTestingModule({
      providers: [
        WebSocketService,
        { provide: WebSocketClientService, useValue: spy }
      ]
    });
    service = TestBed.inject(WebSocketService);
    webSocketClientSpy = TestBed.inject(WebSocketClientService) as jasmine.SpyObj<WebSocketClientService>;
  });

  afterEach(() => {
    // complete all subjects
    service.ngOnDestroy();
    onOpen$.complete();
    onClose$.complete();
    socketDestinationSubject$.complete();
    socketSourceSubject$.complete();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    // Constructing the service should call connect
    expect(webSocketClientSpy.connect.calls.count()).toBe(1);
  });

  it('should pass through onOpen$ events to openSubject$', (done) => {
    service.openSubject$.subscribe(done);
    onOpen$.next('Success');
  });

  it('should pass through onClose$ events to closeSubject$', (done) => {
    service.closeSubject$.subscribe(done);
    onClose$.next('Success');
  });

  it('should log errors from the socket to the console', (done) => {
    const errorSpy = spyOn(console, 'error');
    errorSpy.and.callFake(done);
    socketSourceSubject$.error('test');
  });

  it('should forward send events to the websocket', (done) => {
    socketDestinationSubject$.subscribe(msg => {
      expect(msg).toBe('data');
      done();
    });
    service.send('data');
  });

  it('should send a register message when register is called and reflect success if no error is sent back', (done) => {
    socketDestinationSubject$.pipe(first()).subscribe(msg => {
      expect(msg).toEqual({action: 'register', name: 'test'});
      expect(localStorage.getItem('name')).toBe('test');
      setTimeout(() => {
        socketSourceSubject$.next({action: 'register'});
      }, 5);
    });
    service.register('test').subscribe(success => {
      expect(success).toBeTrue();
      done();
    });
  });

  it('should send a register message when register is called and return false if an error is sent back', (done) => {
    socketDestinationSubject$.pipe(first()).subscribe(msg => {
      expect(msg).toEqual({action: 'register', name: 'test'});
      expect(localStorage.getItem('name')).toBe('test');
      setTimeout(() => {
        socketSourceSubject$.next({action: 'register', error: 'failed to register'});
      }, 5);
    });
    service.register('test').subscribe(success => {
      expect(success).toBeFalse();
      done();
    });
  });

  it('should return false when registering if the socket is closed', (done) => {
    socketSubject$.unsubscribe();
    service.register('test').subscribe(success => {
      expect(success).toBeFalse();
      done();
    });
  });

  it('should forward received messages to onMessage$', (done) => {
    let count = 0;
    service.onMessage$.subscribe(msg => {
      if (count === 0) {
        expect(msg).toEqual({action: 'register'});
      } else {
        expect(msg).toEqual({action: 'register', error: 'test'});
        done();
      }
      count += 1;
    });
    socketDestinationSubject$.pipe(first()).subscribe(msg => {
      expect(msg).toEqual({action: 'register', name: 'test'});
      expect(localStorage.getItem('name')).toBe('test');
      socketSourceSubject$.next({action: 'register'});
      setTimeout(() => {
        socketSourceSubject$.next({action: 'register', error: 'test'});
      }, 5);
    });
    service.register('test');
  });

  it('should re-register if the socket re-opens after registering', (done) => {
    let count = 0;
    socketDestinationSubject$.subscribe(msg => {
      expect(msg).toEqual({action: 'register', name: 'test'});
      expect(localStorage.getItem('name')).toBe('test');
      if (count === 0) {
        count += 1;
        socketSourceSubject$.next({action: 'register'});
        onOpen$.next('');
      } else {
        done();
      }
    });
    service.register('test');
  });

  it('should not re-register if name is removed from local storage', (done) => {
    let count = 0;
    socketDestinationSubject$.subscribe(msg => {
      expect(msg).toEqual({action: 'register', name: 'test'});
      expect(localStorage.getItem('name')).toBe('test');
      localStorage.removeItem('name');
      if (count === 0) {
        count += 1;
        socketSourceSubject$.next('success');
        onOpen$.next('');
      } else {
        done.fail('Should not have re-registered');
      }
    });
    setTimeout(() => {
      expect(count).toBe(1);
      done();
    }, 500);
    service.register('test');
  });
});
