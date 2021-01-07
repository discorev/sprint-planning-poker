import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { WebSocketService } from '@app/services/web-socket.service';
import { Subject } from 'rxjs';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';

describe('AppComponent', () => {
  let app: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let webSocketServiceSpy: jasmine.SpyObj<WebSocketService>;
  let openSubject$: Subject<unknown>;
  let closeSubject$: Subject<unknown>;
  let onMessage$: Subject<unknown>;

  beforeEach(async () => {
    openSubject$ = new Subject();
    closeSubject$ = new Subject();
    onMessage$ = new Subject();
    const spy = jasmine.createSpyObj('WebSocketService', ['send'], {
      openSubject$, closeSubject$, onMessage$
    });
    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule
      ],
      declarations: [
        AppComponent
      ],
      providers: [
        { provide: WebSocketService, useValue: spy }
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
    webSocketServiceSpy = TestBed.inject(WebSocketService) as jasmine.SpyObj<WebSocketService>;
    fixture.detectChanges();
  });

  afterEach(() => {
    closeSubject$.complete();
    openSubject$.complete();
    onMessage$.complete();
  });

  it('should create the app', () => {
    expect(app).toBeTruthy();
  });

  it('should show the connecting modal when the close subject is called', () => {
    closeSubject$.next('');
    fixture.whenStable().then(() => {
      const modalBdEl: HTMLElement = fixture.debugElement.query(By.css('.modal-backdrop')).nativeElement;
      expect(modalBdEl).toBeTruthy();
      closeSubject$.complete();
    });

  });

  it('should hide the connecting modal when the open subject is called', () => {
    closeSubject$.next('');
    fixture.whenStable().then(() => {
      const modalBdEl: HTMLElement = fixture.debugElement.query(By.css('.modal-backdrop')).nativeElement;
      expect(modalBdEl).toBeTruthy();
      openSubject$.next('');

      fixture.whenStable().then(() => {
        const modalBdDebugEl: DebugElement = fixture.debugElement.query(By.css('.modal-backdrop'));
        expect(modalBdDebugEl).toBeNull();
      });
    });
  });

  it('should send selection to the WebSocket when it is changed', () => {
    const sendSpy = webSocketServiceSpy.send;
    app.selectionChanged('?');
    fixture.detectChanges();
    expect(sendSpy.calls.count()).toBe(1);
    const expected: any = {choice: '?', action: 'record-choice'};
    expect(sendSpy.calls.first().args[0]).toEqual(expected);
  });

  it('should send reset event to the WebSocket when sendRest is called', () => {
    const sendSpy = webSocketServiceSpy.send;
    app.sendReset();
    fixture.detectChanges();
    expect(sendSpy.calls.count()).toBe(1);
    const expected: any = {action: 'reset'};
    expect(sendSpy.calls.first().args[0]).toEqual(expected);
  });

  it('should accept a list of players from the WebSocket', () => {
    const players = ['player1', 'player2', 'player3'];
    const expected = players.map(player => {
      return { name: player, selected: false};
    });
    onMessage$.subscribe(_ => expect(app.players).toEqual(expected));
    onMessage$.next({ players });
  });

  it('should update a players status when they make a selection', () => {
    app.players = [
      { name: 'player1', selected: false },
      { name: 'player2', selected: false },
      { name: 'player3', selected: false }
    ];

    const expected = [
      { name: 'player1', selected: false },
      { name: 'player2', selected: true },
      { name: 'player3', selected: false }
    ];
    onMessage$.subscribe(_ => expect(app.players).toEqual(expected));
    onMessage$.next({ name: 'player2', selected: true });
  });

  // it('should add a player to the list if they are not already there and make a choice', () => {
  //   const expected = [
  //     { name: 'player2', selected: true }
  //   ];
  //   onMessage$.subscribe(_ => expect(app.players).toEqual(expected));
  //   onMessage$.next({ name: 'player2', selected: true });
  // });
});
