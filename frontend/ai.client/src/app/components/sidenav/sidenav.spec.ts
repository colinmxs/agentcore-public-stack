import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sidenav } from './sidenav';

describe('Sidenav', () => {
  let component: Sidenav;
  let fixture: ComponentFixture<Sidenav>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidenav],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Sidenav);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
