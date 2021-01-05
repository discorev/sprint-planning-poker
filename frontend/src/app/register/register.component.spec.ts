import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterComponent } from './register.component';
import { WebSocketService } from '@app/services/web-socket.service';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let webSocketServiceSpy: jasmine.SpyObj<WebSocketService>;

  beforeEach(async () => {
    webSocketServiceSpy = jasmine
      .createSpyObj('WebSocketService', ['register'], ['lastError']);
    await TestBed.configureTestingModule({
      imports: [ FormsModule ],
      declarations: [ RegisterComponent ],
      providers: [{provide: WebSocketService, useValue: webSocketServiceSpy}]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fire registerChanged with the value returned from the WebSocketService', () => {
    const registerSpy = webSocketServiceSpy.register.and.returnValue(of(true));
    component.registeredChange.subscribe((result: boolean) => expect(result).toBeTrue());
    component.register();
    expect(registerSpy.calls.any()).toBe(true, 'register called');
  });

  it('should set and show an error when it fails to register', () => {
    // Setup the spy to fail to regiser and return an error
    const registerSpy = webSocketServiceSpy.register.and.returnValue(of(false));
    (Object.getOwnPropertyDescriptor(webSocketServiceSpy, 'lastError')?.get as jasmine.Spy).and.returnValue('Cannot be empty');

    // Watch the registerChanged event to ensure it returns false
    component.registeredChange.subscribe((result: boolean) => expect(result).toBeFalse());

    // Call register and validate that the service is called and error is set correctly
    component.register();
    expect(registerSpy.calls.any()).toBe(true, 'register called');
    expect(component.error).toBe('Cannot be empty');

    // Verify the HTML is updated to show the error
    fixture.detectChanges();
    const alertEl: HTMLElement = fixture.debugElement.query(By.css('.alert')).nativeElement;
    expect(alertEl.textContent).toBe('Failed! Cannot be empty ×');
  });

  it('should bind name input to name property', () => {
    const nameInputEl: HTMLInputElement = fixture.debugElement.query(By.css('input')).nativeElement;
    expect(component.name).toBe('');
    fixture.whenStable().then(() => {
      nameInputEl.value = 'Test';
      nameInputEl.dispatchEvent(new Event('input'));
      expect(component.name).toBe('Test');
    });
  });
});
