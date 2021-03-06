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

  it('should show the connecting modal when the close subject is called', (done) => {
    jQuery('#connectingModal').on('shown.bs.modal', done);
    closeSubject$.next('');
    fixture.detectChanges();
  });

  it('should hide the connecting modal when the open subject is called', (done) => {
    const connectingModal = jQuery('#connectingModal');
    connectingModal.on('hide.bs.modal', done);
    connectingModal.on('shown.bs.modal', () => {
      closeSubject$.complete();
      openSubject$.next('');
      fixture.detectChanges();
    });

    closeSubject$.next('');
    fixture.detectChanges();
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
    expect(webSocketServiceSpy.send.calls.count()).toBe(1);
    expect(webSocketServiceSpy.send.calls.first().args[0]).toEqual({action: 'reset'});
  });

  it('should accept a list of players from the WebSocket', (done) => {
    const players = [
      { name: 'player1', choice: null, snoozed: false },
      { name: 'player2', choice: null, snoozed: false },
      { name: 'player3', choice: null, snoozed: false }];
    const expected = players.map(player => {
      // @ts-ignore
      player.selected = false;
      return jasmine.objectContaining(player);
    });
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual(expected);
      done();
    });
    onMessage$.next({ players });
  });

  it('should update a players status when they make a selection', (done) => {
    app.players = [
      { name: 'player1', selected: false, snoozed: false },
      { name: 'player2', selected: false, snoozed: false },
      { name: 'player3', selected: false, snoozed: false }
    ];

    const expected = [
      { name: 'player1', selected: false, snoozed: false },
      { name: 'player2', selected: true, snoozed: false },
      { name: 'player3', selected: false, snoozed: false }
    ];
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual(expected);
      done();
    });
    onMessage$.next({ name: 'player2', selected: true });
  });

  it('should add a player to the list if they are not already there and make a choice', (done) => {
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual([
        { name: 'player2', selected: true, snoozed: false }
      ]);
      done();
    });
    onMessage$.next({ name: 'player2', selected: true });
  });

  it('should reset data when a reset message is sent', (done) => {
    app.players = [
      { name: 'player1', selected: true, choice: '1', snoozed: false },
      { name: 'player2', selected: true, choice: '1', snoozed: false },
      { name: 'player3', selected: true, choice: '1', snoozed: false }
    ];
    app.showReset = true;
    app.selection = '?';

    const expected = [
      { name: 'player1', selected: false, choice: undefined, snoozed: false },
      { name: 'player2', selected: false, choice: undefined, snoozed: false },
      { name: 'player3', selected: false, choice: undefined, snoozed: false }
    ];
    onMessage$.subscribe(_ => {
      expect(app.showReset).toBeFalse();
      expect(app.selection).toBeUndefined();
      expect(app.players).toEqual(expected);
      done();
    });
    onMessage$.next({ reset: true });
  });

  it('should reveal all players choices', (done) => {
    app.registered = true; // This is needed to make the players show up
    app.players = [
      { name: 'player1', selected: false, snoozed: false },
      { name: 'player2', selected: true, snoozed: false }
    ];
    fixture.detectChanges();
    const cardsBeforeReveal: DebugElement[] = fixture.debugElement.queryAll(By.css('.player-choice'));
    expect(cardsBeforeReveal.length).toBe(2);
    cardsBeforeReveal.forEach((cardDbg, idx) => {
      const card: HTMLElement = cardDbg.nativeElement;
      if (idx === 0) {
        expect(card.classList.contains('border-primary')).toBeFalse();
      } else {
        expect(card.classList.contains('border-primary')).toBeTrue();
      }
      const cardTextEl: HTMLElement = cardDbg.query(By.css('.card-title')).nativeElement;
      expect(cardTextEl.textContent).toBe(app.players[idx].name ?? '');
    });

    const expected = [
      { name: 'player1', selected: true, choice: '?', snoozed: false },
      { name: 'player2', selected: true, choice: '1', snoozed: false },
      { name: 'player3', selected: true, choice: '2', snoozed: false }
    ];
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual(expected);
      fixture.whenStable().then(() => {
        fixture.detectChanges();
        const cards: DebugElement[] = fixture.debugElement.queryAll(By.css('.player-choice'));
        expect(cards.length).toBe(expected.length);
        cards.forEach((cardDbg, idx) => {
          const card: HTMLElement = cardDbg.nativeElement;
          expect(card.classList.contains('border-primary')).toBeTrue();
          const cardTextEl: HTMLElement = cardDbg.query(By.css('.card-text')).nativeElement;
          expect(cardTextEl.textContent).toBe(expected[idx].choice);
        });
        done();
      });
    });
    onMessage$.next({ choices: [
        { name: 'player1', selected: true, choice: '?', snoozed: false },
        { name: 'player2', selected: true, choice: '1', snoozed: false },
        { name: 'player3', selected: true, choice: '2', snoozed: false }
      ]
    });
  });

  it('should fire the confetti cannon when all players choose the same value', (done) => {
    app.players = [
      { name: 'player1', selected: false, snoozed: false }
    ];

    const expected = [
      { name: 'player1', selected: true, choice: '?', snoozed: false }
    ];
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual(expected);
      expect(app.confetti).toBeTrue();
      done();
    });
    onMessage$.next({ choices: [
        { name: 'player1', selected: true, choice: '?', snoozed: false }
      ]
    });
  });

  it('should not fire the confetti cannon if choices are revealed and all players are snoozed', (done) => {
    app.players = [
      { name: 'player1', selected: false, snoozed: false }
    ];

    const expected = [
      { name: 'player1', selected: true, choice: undefined, snoozed: true }
    ];
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual(expected);
      expect(app.confetti).toBeFalse();
      done();
    });
    onMessage$.next({ choices: [
        { name: 'player1', selected: true, snoozed: true }
      ]
    });
  });

  it('should send a snooze message when the snooze button is pressed for a player', () => {
    app.players = [
      { name: 'player1', selected: false, snoozed: false }
    ];
    app.registered = true;
    fixture.detectChanges();
    const snoozeSpan: DebugElement = fixture.debugElement.query(By.css('.btn-snooze'));
    expect(snoozeSpan.nativeElement.classList.contains('text-subtle')).toBeTrue();

    const sendSpy = webSocketServiceSpy.send;
    const snoozeLink: HTMLElement = snoozeSpan.query(By.css('a')).nativeElement;
    snoozeLink.click();
    expect(sendSpy.calls.count()).toBe(1);
    const expected: any = {player: 'player1', action: 'snooze'};
    expect(sendSpy.calls.first().args[0]).toEqual(expected);
  });

  it('should mark a player as snoozed when a snooze message comes through', (done) => {
    app.players = [
      { name: 'player1', selected: false, snoozed: false }
    ];
    app.registered = true;
    fixture.detectChanges();
    const snoozeSpan: DebugElement = fixture.debugElement.query(By.css('.btn-snooze'));

    const expected = [
      { name: 'player1', selected: false, snoozed: true }
    ];
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual(expected);
      fixture.detectChanges();
      expect(snoozeSpan.nativeElement.classList.contains('text-muted')).toBeFalse();
      done();
    });
    onMessage$.next({ action: 'snooze', player: 'player1', snoozed: true });
  });

  it('should ignore a snooze message for an unknown player', (done) => {
    app.players = [
      { name: 'player1', selected: false, snoozed: false }
    ];
    app.registered = true;
    fixture.detectChanges();

    const expected = [
      { name: 'player1', selected: false, snoozed: false }
    ];
    onMessage$.subscribe(_ => {
      expect(app.players).toEqual(expected);
      fixture.detectChanges();
      done();
    });
    onMessage$.next({ action: 'snooze', player: 'player2', snoozed: true });
  });
});
