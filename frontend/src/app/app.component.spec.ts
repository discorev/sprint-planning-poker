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
  const openSubject$ = new Subject();
  const closeSubject$ = new Subject();
  const onMessage$ = new Subject();

  beforeEach(async () => {
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

  it('should create the app', () => {
    expect(app).toBeTruthy();
  });

  it('should show the connecting modal when the close subject is called', () => {
    closeSubject$.next('');
    fixture.whenStable().then(() => {
      const modalBdEl: HTMLElement = fixture.debugElement.query(By.css('.modal-backdrop')).nativeElement;
      expect(modalBdEl).toBeTruthy();
    });

  });

  it('should hide the connecting modal when the open subject is called', () => {
    openSubject$.next('');
    fixture.whenStable().then(() => {
      const modalBdDebugEl: DebugElement = fixture.debugElement.query(By.css('.modal-backdrop'));
      expect(modalBdDebugEl).toBeNull();
    });
  });

  it('should send a selection to the WebSocket', () => {
    const sendSpy = webSocketServiceSpy.send;
    app.selectionChanged('?');
    fixture.detectChanges();
    expect(sendSpy.calls.count()).toBe(1);
    const expected: any = {choice: '?', action: 'record-choice'};
    expect(sendSpy.calls.first().args[0]).toEqual(expected);
  });
});
