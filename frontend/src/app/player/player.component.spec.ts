import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayerComponent } from './player.component';
import { Person } from '@app/models/person.model';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';

describe('PlayerComponent', () => { // tslint:disable:no-non-null-assertion
  let component: PlayerComponent;
  let fixture: ComponentFixture<PlayerComponent>;
  let player: Person;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PlayerComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PlayerComponent);
    component = fixture.componentInstance;
    // Create a new player for each test
    player = new Person();
    player.name = 'Test';

    component.data = player;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    const playerElements: DebugElement[] = fixture.debugElement.queryAll(By.css('.player-choice'));
    expect(playerElements.length).withContext('with the expected HTML element').toEqual(1);

    const playerCardTitlteElements = playerElements[0].queryAll(By.css('.card-title'));
    expect(playerCardTitlteElements.length).withContext('with a title for the player name').toEqual(1);

    const playerCardTitle: HTMLElement = playerCardTitlteElements[0].nativeElement;
    expect(playerCardTitle.innerText).withContext('with the expected player name').toEqual('Test');
  });

  it('should have a border that reflects if a selection has been made', () => {
    const playerElement: HTMLElement = fixture.debugElement.queryAll(By.css('.player-choice'))[0].nativeElement;

    // Ensure the test always starts with the player not having made a selection
    player.selected = false;
    fixture.detectChanges();
    expect(playerElement.classList.contains('selected')).withContext('when a selection has not been made').toBeFalse();

    player.selected = true;
    fixture.detectChanges();

    expect(playerElement.classList.contains('selected')).withContext('when a selection has been made').toBeTrue();
  });

  it('should show the observer icon when in observer mode only', () => {
    // Start with observer set to false
    player.observer = false;
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('.observer')).length)
      .withContext('element presence when in not observer mode').toEqual(0);

    player.observer = true;
    fixture.detectChanges();

    const observerDebugElement = fixture.debugElement.queryAll(By.css('.observer')).shift();
    expect(observerDebugElement).withContext('element presence when in observer mode').toBeDefined();

    // Check for the eyes fontawesome icon
    const eyesElement = observerDebugElement?.query(By.css('.fa-eyes'));
    expect(eyesElement).toBeDefined();
    expect(eyesElement!.name).toEqual('i');
    expect(eyesElement!.properties.ariaHidden).toEqual('true');

    // Ensure that accessibility is met
    const accessibleElement = observerDebugElement?.query(By.css('.sr-only'));
    expect(accessibleElement).toBeDefined();
    expect(accessibleElement!.nativeElement.innerText).toEqual('observer');
  });

  it('should show the snooze icon when in player mode', () => {
    // Start with observer being set to true
    player.observer = true;
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('.btn-snooze')).length)
      .withContext('snooze element presence when in observer mode').toEqual(0);

    player.observer = false;
    fixture.detectChanges();

    const snoozeDebugElement = fixture.debugElement.queryAll(By.css('.btn-snooze')).shift();
    expect(snoozeDebugElement).withContext('snooze element presence when in player mode').toBeDefined();

    // Check for the snooze fontawesome icon
    const snoozeIconElement = snoozeDebugElement?.query(By.css('.fa-snooze'));
    expect(snoozeIconElement).toBeDefined();
    expect(snoozeIconElement!.name).toEqual('i');
    expect(snoozeIconElement!.properties.ariaHidden).toEqual('true');
  });

  it('should show reflect the snooze state', () => {
    // Ensure that observer mode is false and snooze is false too
    spyOn(component.snoozeClicked, 'emit');
    player.observer = false;
    player.snoozed = false;
    fixture.detectChanges();

    const snoozeDebugElement = fixture.debugElement.queryAll(By.css('.btn-snooze')).shift();
    expect(snoozeDebugElement).withContext('snooze element presence when in player mode').toBeDefined();

    // Verify the styling of the snooze button and sr-text
    expect(snoozeDebugElement!.nativeElement).toHaveClass('text-subtle');
    const snoozeIconElement = snoozeDebugElement?.query(By.css('.fa-snooze'));
    expect(snoozeIconElement).toBeDefined();
    expect(snoozeIconElement!.name).toEqual('i');
    expect(snoozeIconElement!.properties.ariaHidden).toEqual('true');
    expect(snoozeIconElement!.nativeElement).toHaveClass('fal');
    expect(fixture.debugElement.query(By.css('.sr-only')).nativeElement.innerText)
      .toEqual('active player');

    // Check pressing the button causes an event to be emitted
    const snoozeButton = snoozeDebugElement!.query(By.css('a'));
    const testSnoozeButtonPress = () => {
      // Test that when the snooze button is clicked that an event is emitted flipping the snooze state
      snoozeButton.nativeElement.click();
      fixture.detectChanges();
      expect(component.snoozeClicked.emit).toHaveBeenCalledWith(!player.snoozed);
    };

    testSnoozeButtonPress();

    player.snoozed = true;
    fixture.detectChanges();

    testSnoozeButtonPress();

    // Check that style changes have been applied when player is snoozed
    expect(snoozeDebugElement!.classes['text-subtle']).toBeUndefined();
    expect(snoozeIconElement!.nativeElement).toHaveClass('far');
    expect(fixture.debugElement.query(By.css('.sr-only')).nativeElement.innerText)
      .toEqual('snoozed player');
  });

  it('should show a players choice when provided', () => {
    const choiceDebugElement = fixture.debugElement.query(By.css('.card-text'));
    player.choice = undefined;
    fixture.detectChanges();

    expect(choiceDebugElement.nativeElement.innerText).toEqual(' ');

    player.choice = 'This is a test';
    fixture.detectChanges();

    expect(choiceDebugElement.nativeElement.innerText).toEqual('This is a test');
  });
});
