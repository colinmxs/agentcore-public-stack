import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelSettings } from './model-settings';

describe('ModelSettings', () => {
  let component: ModelSettings;
  let fixture: ComponentFixture<ModelSettings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelSettings]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModelSettings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
