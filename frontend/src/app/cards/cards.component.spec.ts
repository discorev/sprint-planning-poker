import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardsComponent } from './cards.component';
import { By } from '@angular/platform-browser';

describe('CardsComponent', () => {
  let component: CardsComponent;
  let fixture: ComponentFixture<CardsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CardsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('raises the selectionChange when a choice is made', () => {
    const expected = '?';
    component.selectionChange.subscribe((selection: string) => expect(selection).toBe(expected));
    component.choose(expected);
  });

  it('should raise selectionChange when a card is clicked', () => {
    const cardEl: HTMLElement = fixture.debugElement.queryAll(By.css('.card'))[0].nativeElement;
    expect(cardEl.classList.contains('bg-primary')).toBeFalse();
    expect(cardEl.classList.contains('text-white')).toBeFalse();
    component.selectionChange
      .subscribe((selection: string) => expect(selection).toBe(component.cards[0]));
    cardEl.click();

    fixture.detectChanges();
    expect(cardEl.classList.contains('bg-primary')).toBeTrue();
    expect(cardEl.classList.contains('chosen')).toBeTrue();
  });

  it('deselects when the same choice is made', () => {
    const expected = '?';
    component.selection = expected;
    component.choose(expected);
    expect(component.selection).toBeUndefined();
  });

  it('changes selection when a different choice is made', () => {
    component.selection = '?';
    expect(component.selection).toBe('?');
    const expected = '2';
    component.choose(expected);
    expect(component.selection).toBe(expected);
  });

  it('ignores choices when disabled', () => {
    component.disabled = true;
    const expected = '2';
    component.choose(expected);
    expect(component.selection).toBeUndefined();
  });

  it('should have an element for each card', () => {
    const cards = fixture.debugElement.queryAll(By.css('.card'));

    cards.forEach((cardDe, idx) => {
      const cardTextEl: HTMLElement = cardDe.query(By.css('.card-text')).nativeElement;
      expect(cardTextEl.textContent).toBe(component.cards[idx]);
    });
  });
});
